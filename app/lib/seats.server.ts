import { and, eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "~/db";
import { coupons, enrollments, purchases, RefundStatus, refunds } from "~/db/schema";
import { grantCourseAccess, hasCourseAccess } from "~/lib/enrollments.server";
import { SEAT_ON_HOLD_MESSAGE } from "~/lib/seats";

type Database = typeof defaultDb;

// Seat Codes live in the `coupons` table. A Seat Code belongs to the Team
// Licence (purchase) that paid for it.

export function getSeatCode(code: string, database: Database = defaultDb) {
  return database.select().from(coupons).where(eq(coupons.code, code)).get();
}

/**
 * A Seat Code is on hold while its Team Licence has an Open Refund Request.
 * Derived from the refunds table, so a decline frees it and an approval
 * voids it without touching the code itself.
 */
export function isTeamLicenceOnHold(
  purchaseId: number,
  database: Pick<Database, "select"> = defaultDb
) {
  return !!database
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(eq(refunds.purchaseId, purchaseId), eq(refunds.status, RefundStatus.Open))
    )
    .get();
}

/** Whether any Team Licence behind a team's Seat Codes has an Open Refund Request. */
export function teamHasOpenRefundRequest(
  teamId: number,
  database: Database = defaultDb
) {
  const purchaseIds = database
    .selectDistinct({ id: coupons.purchaseId })
    .from(coupons)
    .where(eq(coupons.teamId, teamId))
    .all()
    .map((row) => row.id);
  if (purchaseIds.length === 0) return false;
  return !!database
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(inArray(refunds.purchaseId, purchaseIds), eq(refunds.status, RefundStatus.Open))
    )
    .get();
}

export type ClaimSeatResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

/**
 * Claims the Seat behind a Seat Code for a student, granting Course Access.
 * Everything is checked and written in one transaction, so a Refund Request
 * raised at the same moment can't slip a claim past the on-hold check.
 */
export function claimSeat(
  code: string,
  userId: number,
  userCountry: string,
  database: Database = defaultDb
): ClaimSeatResult {
  return database.transaction((tx) => {
    const txDb = tx as unknown as Database;
    const coupon = getSeatCode(code, txDb);
    if (!coupon) {
      return { ok: false, error: "Coupon not found" };
    }

    if (coupon.redeemedByUserId !== null) {
      return { ok: false, error: "Coupon has already been redeemed" };
    }

    if (coupon.voidedAt !== null) {
      return { ok: false, error: "This coupon is no longer valid" };
    }

    if (isTeamLicenceOnHold(coupon.purchaseId, tx)) {
      return { ok: false, error: SEAT_ON_HOLD_MESSAGE };
    }

    if (hasCourseAccess(userId, coupon.courseId, txDb)) {
      return { ok: false, error: "You are already enrolled in this course" };
    }

    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, coupon.purchaseId))
      .get();

    if (purchase?.country && purchase.country !== userCountry) {
      return {
        ok: false,
        error:
          "This coupon can only be redeemed from the same country as the purchaser",
      };
    }

    tx.update(coupons)
      .set({
        redeemedByUserId: userId,
        redeemedAt: new Date().toISOString(),
      })
      .where(eq(coupons.id, coupon.id))
      .run();

    // Reinstates the enrollment of a student who was refunded earlier.
    const enrollment = grantCourseAccess(userId, coupon.courseId, txDb);

    return { ok: true, enrollment };
  });
}

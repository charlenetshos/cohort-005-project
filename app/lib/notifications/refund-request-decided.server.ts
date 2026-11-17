import { eq } from "drizzle-orm";
import { db as appDb } from "~/db";
import { coupons, courses, purchases, refunds, users } from "~/db/schema";
import { sendNotification, type AppDb, type NotifyOptions } from "./send.server";

type Decision = { refundId: number; adminId: number };

const person = { id: users.id, name: users.name, email: users.email };

/** The decided Refund Request, who raised it and who decided it. */
function lookUpDecision(db: AppDb, { refundId, adminId }: Decision) {
  const refund = db
    .select({
      amountRefunded: refunds.amountRefunded,
      declineNote: refunds.declineNote,
      purchaseId: purchases.id,
      buyerId: purchases.userId,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refunds)
    .innerJoin(purchases, eq(purchases.id, refunds.purchaseId))
    .innerJoin(courses, eq(courses.id, purchases.courseId))
    .where(eq(refunds.id, refundId))
    .get();
  if (!refund) throw new Error(`Refund Request ${refundId} not found`);

  // The Student, or the team Admin who bought the Team Licence.
  const raisedBy = db.select(person).from(users).where(eq(users.id, refund.buyerId)).get();
  const admin = db.select(person).from(users).where(eq(users.id, adminId)).get();
  if (!raisedBy) throw new Error(`User ${refund.buyerId} not found`);
  if (!admin) throw new Error(`Admin ${adminId} not found`);

  return { refund, raisedBy, admin };
}

/** An Admin approved a Refund Request: tell whoever raised it. */
export function notifyRefundRequestApproved(
  input: Decision,
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("refund-request-approved", store, () => {
    const { refund, raisedBy, admin } = lookUpDecision(db, input);
    const isTeamLicence = !!db
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.purchaseId, refund.purchaseId))
      .get();

    return {
      recipients: [raisedBy],
      actor: admin,
      payload: {
        kind: "refund-request-approved",
        data: {
          courseTitle: refund.courseTitle,
          courseSlug: refund.courseSlug,
          amount: refund.amountRefunded ?? 0,
          isTeamLicence,
          url: `/courses/${refund.courseSlug}`,
        },
      },
    };
  });
}

/** An Admin declined a Refund Request: tell whoever raised it why. */
export function notifyRefundRequestDeclined(
  input: Decision,
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("refund-request-declined", store, () => {
    const { refund, raisedBy, admin } = lookUpDecision(db, input);

    return {
      recipients: [raisedBy],
      actor: admin,
      payload: {
        kind: "refund-request-declined",
        data: {
          courseTitle: refund.courseTitle,
          courseSlug: refund.courseSlug,
          note: refund.declineNote ?? "",
          url: `/courses/${refund.courseSlug}`,
        },
      },
    };
  });
}

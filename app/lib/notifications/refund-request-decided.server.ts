import { eq } from "drizzle-orm";
import { db as appDb } from "~/db";
import { coupons, courses, purchases, refunds } from "~/db/schema";
import { getPerson } from "./person.server";
import { sendNotification, type AppDb, type NotifyOptions } from "./send.server";

type Decision = { refundId: number; adminId: number };

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
  const raisedBy = getPerson(db, refund.buyerId);
  const admin = getPerson(db, adminId);

  return { refund, raisedBy, admin };
}

/** An Admin approved a Refund Request: tell whoever raised it. */
export function notifyRefundRequestApproved(
  input: Decision,
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("refund-request-approved", store, () => {
    const { refund, raisedBy, admin } = lookUpDecision(db, input);
    if (refund.amountRefunded === null) {
      throw new Error(`Refund Request ${input.refundId} has no amount refunded`);
    }
    const isTeamLicence = !!db
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.purchaseId, refund.purchaseId))
      .get();

    return {
      recipients: [raisedBy],
      actor: admin,
      data: {
        courseTitle: refund.courseTitle,
        courseSlug: refund.courseSlug,
        amount: refund.amountRefunded,
        isTeamLicence,
        url: `/courses/${refund.courseSlug}`,
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
    if (refund.declineNote === null) {
      throw new Error(`Refund Request ${input.refundId} has no decline note`);
    }

    return {
      recipients: [raisedBy],
      actor: admin,
      data: {
        courseTitle: refund.courseTitle,
        courseSlug: refund.courseSlug,
        note: refund.declineNote,
        url: `/courses/${refund.courseSlug}`,
      },
    };
  });
}

import { RefundStatus } from "~/db/schema";

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;
export const MAX_REFUND_REQUESTS_PER_PURCHASE = 2;

export type RefundEligibilityFacts = {
  purchase: { createdAt: string; amountPaid: number };
  refundRequestStatuses: RefundStatus[];
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
  hasClaimedTeamSeat: boolean;
};

export type RefundEligibility =
  | { eligible: true; amount: number; lastDayInWindow: string }
  | { eligible: false; reason: string };

// Compare whole days, not hours — a purchase at 23:00 should still get its
// full last day.
function asDayString(when: Date) {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastDayOfRefundWindow(purchasedAtIso: string) {
  const windowEnd = new Date(purchasedAtIso);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  return asDayString(windowEnd);
}

/**
 * Whether a learner may raise a Refund Request on a purchase right now, and
 * if so how much they would get back. See GLOSSARY.md: Refund Eligibility.
 */
export function assessRefundEligibility(
  facts: RefundEligibilityFacts,
  now: Date = new Date()
): RefundEligibility {
  const statuses = facts.refundRequestStatuses;

  if (statuses.includes(RefundStatus.Approved)) {
    return {
      eligible: false,
      reason: "This purchase has already been refunded.",
    };
  }

  if (statuses.includes(RefundStatus.Requested)) {
    return {
      eligible: false,
      reason: "You already have a refund request open on this purchase.",
    };
  }

  if (statuses.length >= MAX_REFUND_REQUESTS_PER_PURCHASE) {
    return {
      eligible: false,
      reason: `A purchase can have at most ${MAX_REFUND_REQUESTS_PER_PURCHASE} refund requests.`,
    };
  }

  const purchasedDay = asDayString(new Date(facts.purchase.createdAt));
  const lastDayInWindow = lastDayOfRefundWindow(facts.purchase.createdAt);
  const today = asDayString(now);

  if (today < purchasedDay || today > lastDayInWindow) {
    return {
      eligible: false,
      reason: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return {
      eligible: false,
      reason: "You have completed too much of this course to get a refund.",
    };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return {
      eligible: false,
      reason: "You have watched too much of this course to get a refund.",
    };
  }

  if (facts.hasClaimedTeamSeat) {
    return {
      eligible: false,
      reason: "A claimed team seat cannot be refunded.",
    };
  }

  // A Refund is always the full amount the learner paid — never the list
  // price, which may have changed or been discounted.
  return { eligible: true, amount: facts.purchase.amountPaid, lastDayInWindow };
}

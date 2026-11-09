import { describe, it, expect } from "vitest";
import { RefundStatus } from "~/db/schema";
import {
  assessRefundEligibility,
  type RefundEligibilityFacts,
} from "./refund-eligibility";

const purchasedAt = new Date(2026, 10, 1, 23, 0); // 1 Nov, 23:00 local
const daysAfterPurchase = (days: number, hour = 12) =>
  new Date(2026, 10, 1 + days, hour, 0);

function facts(overrides: Partial<RefundEligibilityFacts> = {}) {
  return {
    purchase: { createdAt: purchasedAt.toISOString(), amountPaid: 7900 },
    refundRequestStatuses: [],
    lessonCount: 10,
    completedLessonCount: 1,
    secondsWatched: 20 * 60,
    hasClaimedTeamSeat: false,
    ...overrides,
  } satisfies RefundEligibilityFacts;
}

describe("assessRefundEligibility", () => {
  it("is eligible early on, for the amount paid", () => {
    expect(assessRefundEligibility(facts(), daysAfterPurchase(3))).toEqual({
      eligible: true,
      amount: 7900,
      lastDayInWindow: "2026-11-15",
    });
  });

  it("refunds what was paid, not the list price", () => {
    const result = assessRefundEligibility(
      facts({
        purchase: { createdAt: purchasedAt.toISOString(), amountPaid: 5900 },
      }),
      daysAfterPurchase(3)
    );
    expect(result).toMatchObject({ eligible: true, amount: 5900 });
  });

  it("counts the last day of the window as a whole day", () => {
    expect(
      assessRefundEligibility(facts(), daysAfterPurchase(14, 22)).eligible
    ).toBe(true);
  });

  it("closes after the window", () => {
    expect(
      assessRefundEligibility(facts(), daysAfterPurchase(15)).eligible
    ).toBe(false);
  });

  it("refuses once half the lessons are completed", () => {
    expect(
      assessRefundEligibility(
        facts({ completedLessonCount: 5 }),
        daysAfterPurchase(3)
      ).eligible
    ).toBe(false);
  });

  it("refuses once two hours have been watched", () => {
    expect(
      assessRefundEligibility(
        facts({ secondsWatched: 2 * 60 * 60 }),
        daysAfterPurchase(3)
      ).eligible
    ).toBe(false);
  });

  it("refuses a claimed team seat", () => {
    expect(
      assessRefundEligibility(
        facts({ hasClaimedTeamSeat: true }),
        daysAfterPurchase(3)
      ).eligible
    ).toBe(false);
  });

  it("refuses while a request is open", () => {
    expect(
      assessRefundEligibility(
        facts({ refundRequestStatuses: [RefundStatus.Requested] }),
        daysAfterPurchase(3)
      ).eligible
    ).toBe(false);
  });

  it("allows a second request after a decline", () => {
    expect(
      assessRefundEligibility(
        facts({ refundRequestStatuses: [RefundStatus.Declined] }),
        daysAfterPurchase(5)
      ).eligible
    ).toBe(true);
  });

  it("refuses a third request after two declines", () => {
    expect(
      assessRefundEligibility(
        facts({
          refundRequestStatuses: [RefundStatus.Declined, RefundStatus.Declined],
        }),
        daysAfterPurchase(5)
      ).eligible
    ).toBe(false);
  });

  it("refuses any further request once one is approved", () => {
    expect(
      assessRefundEligibility(
        facts({ refundRequestStatuses: [RefundStatus.Approved] }),
        daysAfterPurchase(5)
      ).eligible
    ).toBe(false);
  });

  it("does not extend the window for a second request", () => {
    expect(
      assessRefundEligibility(
        facts({ refundRequestStatuses: [RefundStatus.Declined] }),
        daysAfterPurchase(16)
      ).eligible
    ).toBe(false);
  });
});

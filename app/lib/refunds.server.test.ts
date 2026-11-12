import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  approveRefundRequest,
  checkRefundRequestEligibility,
  declineRefundRequest,
  listOpenRefundRequests,
} from "./refunds.server";
import { grantCourseAccess, hasCourseAccess } from "./enrollments.server";
import { claimSeat } from "./seats.server";
import { SEAT_ON_HOLD_MESSAGE } from "./seats";

type TestDb = ReturnType<typeof createTestDb>;
// The services are typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof hasCourseAccess>[2]>;
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

let testDb: TestDb;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;
let lessonIds: number[];

function insertPurchase(userId: number, createdAt = "2026-11-01T10:00:00.000Z") {
  return testDb
    .insert(schema.purchases)
    .values({ userId, courseId: base.course.id, amountPaid: 7900, createdAt })
    .returning()
    .get();
}

function insertRefundRequest(
  purchaseId: number,
  requestedAt = "2026-11-05T10:00:00.000Z"
) {
  return testDb
    .insert(schema.refunds)
    .values({ purchaseId, reason: "Not what I expected at all.", requestedAt })
    .returning()
    .get();
}

function getRefund(id: number) {
  return testDb.select().from(schema.refunds).where(eq(schema.refunds.id, id)).get()!;
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  admin = testDb
    .insert(schema.users)
    .values({ name: "Ada Admin", email: "ada@example.com", role: schema.UserRole.Admin })
    .returning()
    .get();

  const module = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3, 4].map(
    (position) =>
      testDb
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("approving a Refund Request", () => {
  it("records the decision and refunds the full amount paid", () => {
    const purchase = insertPurchase(base.user.id);
    grantCourseAccess(base.user.id, base.course.id, asDb(testDb));
    const request = insertRefundRequest(purchase.id);
    const now = new Date("2026-11-06T09:00:00.000Z");

    const result = approveRefundRequest(request.id, admin.id, now, asDb(testDb));

    expect(result.ok).toBe(true);
    const refund = getRefund(request.id);
    expect(refund.status).toBe(schema.RefundStatus.Approved);
    expect(refund.amountRefunded).toBe(7900);
    expect(refund.resolvedAt).toBe(now.toISOString());
    expect(refund.resolvedByUserId).toBe(admin.id);
  });

  it("ends Course Access at once but keeps the student's Progress", () => {
    const purchase = insertPurchase(base.user.id);
    grantCourseAccess(base.user.id, base.course.id, asDb(testDb));
    testDb
      .insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[0],
        status: schema.LessonProgressStatus.Completed,
      })
      .run();
    const request = insertRefundRequest(purchase.id);

    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    expect(hasCourseAccess(base.user.id, base.course.id, asDb(testDb))).toBe(false);
    expect(testDb.select().from(schema.lessonProgress).all()).toHaveLength(1);
    expect(testDb.select().from(schema.enrollments).all()).toHaveLength(1);
  });

  it("lets a refunded student buy again and pick up the same enrollment", () => {
    const purchase = insertPurchase(base.user.id);
    const original = grantCourseAccess(base.user.id, base.course.id, asDb(testDb));
    const request = insertRefundRequest(purchase.id);
    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    const reinstated = grantCourseAccess(base.user.id, base.course.id, asDb(testDb));

    expect(reinstated.id).toBe(original.id);
    expect(reinstated.enrolledAt).toBe(original.enrolledAt);
    expect(hasCourseAccess(base.user.id, base.course.id, asDb(testDb))).toBe(true);
  });

  it("voids unclaimed seat codes on a team purchase and leaves claimed ones", () => {
    const purchase = insertPurchase(base.user.id);
    const team = testDb.insert(schema.teams).values({}).returning().get();
    testDb
      .insert(schema.coupons)
      .values([
        { teamId: team.id, courseId: base.course.id, purchaseId: purchase.id, code: "unclaimed" },
        {
          teamId: team.id,
          courseId: base.course.id,
          purchaseId: purchase.id,
          code: "claimed",
          redeemedByUserId: base.instructor.id,
          redeemedAt: "2026-11-02T10:00:00.000Z",
        },
      ])
      .run();
    const request = insertRefundRequest(purchase.id);

    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    const codes = testDb.select().from(schema.coupons).all();
    expect(codes.find((c) => c.code === "unclaimed")!.voidedAt).not.toBeNull();
    expect(codes.find((c) => c.code === "claimed")!.voidedAt).toBeNull();
  });

  it("refuses to decide a request a second time", () => {
    const purchase = insertPurchase(base.user.id);
    const request = insertRefundRequest(purchase.id);
    declineRefundRequest(request.id, admin.id, "Outside our policy.", new Date(), asDb(testDb));

    const result = approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    expect(result).toEqual({ ok: false, error: "already-decided" });
    expect(getRefund(request.id).status).toBe(schema.RefundStatus.Declined);
  });

  it("reports a request that doesn't exist", () => {
    expect(approveRefundRequest(999, admin.id, new Date(), asDb(testDb))).toEqual({
      ok: false,
      error: "not-found",
    });
  });
});

describe("declining a Refund Request", () => {
  it("records the note and leaves Course Access alone", () => {
    const purchase = insertPurchase(base.user.id);
    grantCourseAccess(base.user.id, base.course.id, asDb(testDb));
    const request = insertRefundRequest(purchase.id);

    const result = declineRefundRequest(
      request.id,
      admin.id,
      "You've finished most of the course.",
      new Date(),
      asDb(testDb)
    );

    expect(result.ok).toBe(true);
    const refund = getRefund(request.id);
    expect(refund.status).toBe(schema.RefundStatus.Declined);
    expect(refund.declineNote).toBe("You've finished most of the course.");
    expect(refund.amountRefunded).toBeNull();
    expect(hasCourseAccess(base.user.id, base.course.id, asDb(testDb))).toBe(true);
  });
});

describe("the Open Refund Request queue", () => {
  it("lists only Open requests, oldest first", () => {
    const first = insertRefundRequest(insertPurchase(base.user.id).id, "2026-11-03T10:00:00.000Z");
    const second = insertRefundRequest(
      insertPurchase(base.instructor.id).id,
      "2026-11-04T10:00:00.000Z"
    );
    const decided = insertRefundRequest(insertPurchase(admin.id).id, "2026-11-02T10:00:00.000Z");
    declineRefundRequest(decided.id, admin.id, "No.", new Date(), asDb(testDb));

    const queue = listOpenRefundRequests(new Date(), asDb(testDb));

    expect(queue.map((row) => row.id)).toEqual([first.id, second.id]);
  });

  it("shows the student's Progress and warns about limits passed since asking", () => {
    const purchase = insertPurchase(base.user.id, "2026-11-01T10:00:00.000Z");
    insertRefundRequest(purchase.id, "2026-11-05T10:00:00.000Z");
    testDb
      .insert(schema.lessonProgress)
      .values(
        lessonIds.slice(0, 2).map((lessonId) => ({
          userId: base.user.id,
          lessonId,
          status: schema.LessonProgressStatus.Completed,
        }))
      )
      .run();
    testDb
      .insert(schema.videoWatchEvents)
      .values([
        { userId: base.user.id, lessonId: lessonIds[0], eventType: "pause", positionSeconds: 3600 },
        { userId: base.user.id, lessonId: lessonIds[0], eventType: "pause", positionSeconds: 4000 },
        { userId: base.user.id, lessonId: lessonIds[1], eventType: "pause", positionSeconds: 3600 },
      ])
      .run();

    const [row] = listOpenRefundRequests(new Date(2026, 10, 10, 12), asDb(testDb));

    expect(row.progress.lessonsCompleted).toBe(2);
    expect(row.progress.lessonCount).toBe(4);
    expect(row.progress.secondsWatched).toBe(7600);
    expect(row.warnings).toEqual(["watched-too-much", "completed-too-much"]);
  });
});

describe("a Team Licence's Refund Request", () => {
  let ana: typeof schema.users.$inferSelect;
  let ben: typeof schema.users.$inferSelect;
  let licence: typeof schema.purchases.$inferSelect;
  let seatCodes: string[];

  beforeEach(() => {
    ana = testDb
      .insert(schema.users)
      .values({ name: "Ana Buyer", email: "ana@example.com", role: schema.UserRole.Student })
      .returning()
      .get();
    ben = testDb
      .insert(schema.users)
      .values({ name: "Ben Member", email: "ben@example.com", role: schema.UserRole.Student })
      .returning()
      .get();

    // Ana buys a Team Licence of 5 Seats. Buying one doesn't enroll her.
    licence = insertPurchase(ana.id);
    const team = testDb.insert(schema.teams).values({}).returning().get();
    testDb
      .insert(schema.teamMembers)
      .values({ teamId: team.id, userId: ana.id, role: schema.TeamMemberRole.Admin })
      .run();
    seatCodes = [1, 2, 3, 4, 5].map((n) => `team-seat-${n}`);
    testDb
      .insert(schema.coupons)
      .values(
        seatCodes.map((code) => ({
          teamId: team.id,
          courseId: base.course.id,
          purchaseId: licence.id,
          code,
        }))
      )
      .run();
  });

  function getSeatCode(code: string) {
    return testDb
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.code, code))
      .get()!;
  }

  it("cancels all Seat Codes and refunds the full amount when approved with no Seats claimed", () => {
    expect(checkRefundRequestEligibility(ana.id, base.course.id, asDb(testDb)).ok).toBe(true);
    const request = insertRefundRequest(licence.id);

    const result = approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    expect(result).toMatchObject({ ok: true, amount: 7900 });
    expect(getRefund(request.id).amountRefunded).toBe(7900);
    for (const code of seatCodes) {
      expect(getSeatCode(code).voidedAt).not.toBeNull();
    }
    expect(hasCourseAccess(ana.id, base.course.id, asDb(testDb))).toBe(false);
  });

  it("puts Seat Codes on hold while the request is Open, frees them on decline and voids them on approval", () => {
    const first = insertRefundRequest(licence.id);

    expect(claimSeat(seatCodes[0], ben.id, "", asDb(testDb))).toEqual({
      ok: false,
      error: SEAT_ON_HOLD_MESSAGE,
    });
    expect(getSeatCode(seatCodes[0]).redeemedByUserId).toBeNull();
    expect(hasCourseAccess(ben.id, base.course.id, asDb(testDb))).toBe(false);

    declineRefundRequest(first.id, admin.id, "Your team is still using it.", new Date(), asDb(testDb));
    const second = insertRefundRequest(licence.id);
    approveRefundRequest(second.id, admin.id, new Date(), asDb(testDb));

    expect(claimSeat(seatCodes[0], ben.id, "", asDb(testDb))).toEqual({
      ok: false,
      error: "This coupon is no longer valid",
    });
  });

  it("lets a Seat Code be claimed again after the request is declined", () => {
    const request = insertRefundRequest(licence.id);
    declineRefundRequest(request.id, admin.id, "Your team is still using it.", new Date(), asDb(testDb));

    const result = claimSeat(seatCodes[0], ben.id, "", asDb(testDb));

    expect(result.ok).toBe(true);
    expect(getSeatCode(seatCodes[0]).redeemedByUserId).toBe(ben.id);
    expect(hasCourseAccess(ben.id, base.course.id, asDb(testDb))).toBe(true);
  });

  it("can't be raised once a team member has claimed a Seat", () => {
    expect(claimSeat(seatCodes[0], ben.id, "", asDb(testDb)).ok).toBe(true);

    expect(checkRefundRequestEligibility(ana.id, base.course.id, asDb(testDb))).toEqual({
      ok: false,
      status: 403,
      message: "A claimed team seat cannot be refunded.",
    });
  });

  it("can't be raised once the buyer has claimed a Seat themself", () => {
    expect(claimSeat(seatCodes[0], ana.id, "", asDb(testDb)).ok).toBe(true);

    expect(checkRefundRequestEligibility(ana.id, base.course.id, asDb(testDb))).toEqual({
      ok: false,
      status: 403,
      message: "A claimed team seat cannot be refunded.",
    });
  });

  it("can't be raised by a student holding a claimed Seat, because they have no purchase", () => {
    expect(claimSeat(seatCodes[0], ben.id, "", asDb(testDb)).ok).toBe(true);

    expect(checkRefundRequestEligibility(ben.id, base.course.id, asDb(testDb))).toEqual({
      ok: false,
      status: 403,
      message: "You have not bought this course.",
    });
  });

  it("shows the Admin the seat count and only the outside-window warning", () => {
    // Asked 20 days after buying, with the buyer's own viewing past the limits —
    // which says nothing about a Team Licence, since she isn't a student on it.
    insertRefundRequest(licence.id, "2026-11-21T10:00:00.000Z");
    testDb
      .insert(schema.lessonProgress)
      .values(
        lessonIds.map((lessonId) => ({
          userId: ana.id,
          lessonId,
          status: schema.LessonProgressStatus.Completed,
        }))
      )
      .run();
    testDb
      .insert(schema.videoWatchEvents)
      .values({ userId: ana.id, lessonId: lessonIds[0], eventType: "pause", positionSeconds: 9000 })
      .run();

    const [row] = listOpenRefundRequests(new Date(2026, 10, 22, 12), asDb(testDb));

    expect(row.isTeamPurchase).toBe(true);
    expect(row.seatCount).toBe(5);
    expect(row.claimedSeatCount).toBe(0);
    expect(row.warnings).toEqual(["outside-window"]);
  });

  it("counts Seats that were claimed before the request, as older data can have them", () => {
    insertRefundRequest(licence.id);
    testDb
      .update(schema.coupons)
      .set({ redeemedByUserId: ben.id, redeemedAt: "2026-11-02T10:00:00.000Z" })
      .where(eq(schema.coupons.code, seatCodes[0]))
      .run();

    const [row] = listOpenRefundRequests(new Date(2026, 10, 6, 12), asDb(testDb));

    expect(row.seatCount).toBe(5);
    expect(row.claimedSeatCount).toBe(1);
  });
});

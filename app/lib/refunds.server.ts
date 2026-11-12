import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  LessonProgressStatus,
  lessonProgress,
  lessons,
  modules,
  purchases,
  RefundStatus,
  refunds,
  users,
  videoWatchEvents,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";
import {
  REFUND_COMPLETION_LIMIT,
  REFUND_WATCH_LIMIT_SECONDS,
  REFUND_WINDOW_DAYS,
  type RefundWarning,
} from "~/lib/refund-policy";

type Database = typeof defaultDb;

// ─── Calendar days ───
// The window is counted in whole days, not hours — matching the course page.

function wholeDaysBetween(from: Date, to: Date) {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

// ─── Raising a Refund Request ───

export type RefundRequestEligibility =
  | { ok: true; purchase: typeof purchases.$inferSelect }
  | { ok: false; status: 403 | 409; message: string };

/**
 * Whether a student's latest purchase of a course can get a new Refund
 * Request. Checks who may ask, not the refund limits (window, time watched),
 * which the course page applies on top.
 */
export function checkRefundRequestEligibility(
  userId: number,
  courseId: number,
  database: Database = defaultDb
): RefundRequestEligibility {
  // A student who claimed a Seat has no purchase of their own, so lands here.
  const purchase = database
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(desc(purchases.createdAt))
    .get();

  if (!purchase) {
    return { ok: false, status: 403, message: "You have not bought this course." };
  }

  const requestWithStatus = (status: RefundStatus) =>
    database
      .select({ id: refunds.id })
      .from(refunds)
      .where(and(eq(refunds.purchaseId, purchase.id), eq(refunds.status, status)))
      .get();

  if (requestWithStatus(RefundStatus.Approved)) {
    return {
      ok: false,
      status: 409,
      message: "This purchase has already been refunded.",
    };
  }

  if (requestWithStatus(RefundStatus.Open)) {
    return {
      ok: false,
      status: 409,
      message: "You already have an open refund request on this purchase.",
    };
  }

  // Once anyone — the buyer included — has claimed a Seat on a Team Licence,
  // the buyer can no longer refund that Team Licence.
  const claimedSeat = database
    .select({ id: coupons.id })
    .from(coupons)
    .where(and(eq(coupons.purchaseId, purchase.id), isNotNull(coupons.redeemedAt)))
    .get();

  if (claimedSeat) {
    return {
      ok: false,
      status: 403,
      message: "A claimed team seat cannot be refunded.",
    };
  }

  return { ok: true, purchase };
}

// ─── The Admin queue ───

export type OpenRefundRequestRow = {
  id: number;
  reason: string;
  requestedAt: string;
  student: { id: number; name: string; email: string };
  course: { id: number; title: string; slug: string };
  purchase: { id: number; amountPaid: number; createdAt: string };
  isTeamPurchase: boolean;
  /** How many Seat Codes the Team Licence has; 0 for a single purchase. */
  seatCount: number;
  /**
   * How many of those Seats are claimed. The rules keep this at 0 while a
   * request is Open, but data from before the rules can have claimed Seats.
   */
  claimedSeatCount: number;
  progress: {
    lessonsCompleted: number;
    lessonCount: number;
    secondsWatched: number;
    daysSincePurchase: number;
    daysSincePurchaseWhenRequested: number;
  };
  warnings: RefundWarning[];
};

function getLessonIdsForCourse(database: Database, courseId: number) {
  return database
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(
  database: Database,
  userId: number,
  lessonIds: number[]
) {
  if (lessonIds.length === 0) return 0;
  const row = database
    .select({ count: sql<number>`count(distinct ${lessonProgress.lessonId})` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();
  return row?.count ?? 0;
}

function getSecondsWatched(
  database: Database,
  userId: number,
  lessonIds: number[]
) {
  if (lessonIds.length === 0) return 0;
  return database
    .select({ furthest: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

/** Every Open Refund Request, oldest first, with the student's Progress. */
export function listOpenRefundRequests(
  now: Date = new Date(),
  database: Database = defaultDb
): OpenRefundRequestRow[] {
  const rows = database
    .select({
      id: refunds.id,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      studentId: users.id,
      studentName: users.name,
      studentEmail: users.email,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      purchasedAt: purchases.createdAt,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.status, RefundStatus.Open))
    .orderBy(asc(refunds.requestedAt), asc(refunds.id))
    .all();

  const lessonIdsByCourse = new Map<number, number[]>();

  return rows.map((row) => {
    let lessonIds = lessonIdsByCourse.get(row.courseId);
    if (!lessonIds) {
      lessonIds = getLessonIdsForCourse(database, row.courseId);
      lessonIdsByCourse.set(row.courseId, lessonIds);
    }

    const lessonsCompleted = getCompletedLessonCount(
      database,
      row.studentId,
      lessonIds
    );
    const secondsWatched = getSecondsWatched(database, row.studentId, lessonIds);
    const purchasedAt = new Date(row.purchasedAt);
    const daysSincePurchase = wholeDaysBetween(purchasedAt, now);
    const daysSincePurchaseWhenRequested = wholeDaysBetween(
      purchasedAt,
      new Date(row.requestedAt)
    );

    const seats = database
      .select({
        total: sql<number>`count(*)`,
        claimed: sql<number>`count(${coupons.redeemedAt})`,
      })
      .from(coupons)
      .where(eq(coupons.purchaseId, row.purchaseId))
      .get();
    const seatCount = seats?.total ?? 0;
    const claimedSeatCount = seats?.claimed ?? 0;
    const isTeamPurchase = seatCount > 0;

    const warnings: RefundWarning[] = [];
    if (daysSincePurchaseWhenRequested > REFUND_WINDOW_DAYS) {
      warnings.push("outside-window");
    }
    // The buyer of a Team Licence isn't a student on it, so their own viewing
    // says nothing about the request — only the window applies.
    if (!isTeamPurchase && secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
      warnings.push("watched-too-much");
    }
    if (
      !isTeamPurchase &&
      lessonIds.length > 0 &&
      lessonsCompleted / lessonIds.length >= REFUND_COMPLETION_LIMIT
    ) {
      warnings.push("completed-too-much");
    }

    return {
      id: row.id,
      reason: row.reason,
      requestedAt: row.requestedAt,
      student: {
        id: row.studentId,
        name: row.studentName,
        email: row.studentEmail,
      },
      course: { id: row.courseId, title: row.courseTitle, slug: row.courseSlug },
      purchase: {
        id: row.purchaseId,
        amountPaid: row.amountPaid,
        createdAt: row.purchasedAt,
      },
      isTeamPurchase,
      seatCount,
      claimedSeatCount,
      progress: {
        lessonsCompleted,
        lessonCount: lessonIds.length,
        secondsWatched,
        daysSincePurchase,
        daysSincePurchaseWhenRequested,
      },
      warnings,
    };
  });
}

// ─── Deciding ───

export type DecisionResult =
  | {
      ok: true;
      student: { name: string; email: string };
      courseTitle: string;
      amount: number;
    }
  | { ok: false; error: "not-found" | "already-decided" };

function getRequestContext(
  database: Pick<Database, "select">,
  refundId: number
) {
  return database
    .select({
      status: refunds.status,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      userId: purchases.userId,
      courseId: purchases.courseId,
      studentName: users.name,
      studentEmail: users.email,
      courseTitle: courses.title,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refunds.id, refundId))
    .get();
}

/**
 * Approves an Open Refund Request. The student loses Course Access at once
 * (their enrollment is revoked, their Progress kept), and any unclaimed seat
 * codes on a team purchase stop being redeemable. Only Open requests can be
 * decided — the first decision stands.
 */
export function approveRefundRequest(
  refundId: number,
  adminId: number,
  now: Date = new Date(),
  database: Database = defaultDb
): DecisionResult {
  return database.transaction((tx) => {
    const context = getRequestContext(tx, refundId);
    if (!context) return { ok: false, error: "not-found" };

    const decidedAt = now.toISOString();
    const decided = tx
      .update(refunds)
      .set({
        status: RefundStatus.Approved,
        amountRefunded: context.amountPaid,
        resolvedAt: decidedAt,
        resolvedByUserId: adminId,
      })
      .where(and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open)))
      .returning({ id: refunds.id })
      .get();

    if (!decided) return { ok: false, error: "already-decided" };

    const isTeamPurchase = !!tx
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.purchaseId, context.purchaseId))
      .get();

    if (isTeamPurchase) {
      // A team purchase never enrolled the buyer, so there is no access to
      // take away — only the seats nobody has claimed yet.
      tx.update(coupons)
        .set({ voidedAt: decidedAt })
        .where(
          and(
            eq(coupons.purchaseId, context.purchaseId),
            isNull(coupons.redeemedAt),
            isNull(coupons.voidedAt)
          )
        )
        .run();
    } else {
      tx.update(enrollments)
        .set({ revokedAt: decidedAt })
        .where(
          and(
            eq(enrollments.userId, context.userId),
            eq(enrollments.courseId, context.courseId),
            isNull(enrollments.revokedAt)
          )
        )
        .run();
    }

    return {
      ok: true,
      student: { name: context.studentName, email: context.studentEmail },
      courseTitle: context.courseTitle,
      amount: context.amountPaid,
    };
  });
}

/**
 * Declines an Open Refund Request with a note to the student. Course Access is
 * untouched, and the student may raise a new Refund Request.
 */
export function declineRefundRequest(
  refundId: number,
  adminId: number,
  note: string,
  now: Date = new Date(),
  database: Database = defaultDb
): DecisionResult {
  return database.transaction((tx) => {
    const context = getRequestContext(tx, refundId);
    if (!context) return { ok: false, error: "not-found" };

    const decided = tx
      .update(refunds)
      .set({
        status: RefundStatus.Declined,
        declineNote: note,
        resolvedAt: now.toISOString(),
        resolvedByUserId: adminId,
      })
      .where(and(eq(refunds.id, refundId), eq(refunds.status, RefundStatus.Open)))
      .returning({ id: refunds.id })
      .get();

    if (!decided) return { ok: false, error: "already-decided" };

    return {
      ok: true,
      student: { name: context.studentName, email: context.studentEmail },
      courseTitle: context.courseTitle,
      amount: context.amountPaid,
    };
  });
}

// ─── Emails ───
// There is no mail transport yet, so callers log these to the server console.

type EmailInput = {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  amount: number;
};

export function buildRefundApprovedEmail(input: EmailInput) {
  return {
    to: input.studentEmail,
    subject: `Refund approved — ${input.courseTitle}`,
    body: [
      `Hi ${input.studentName},`,
      "",
      `We've approved your refund request for "${input.courseTitle}".`,
      `You'll get back ${formatPrice(input.amount)}, the full amount you paid. We'll email you again once the money has been sent.`,
      "",
      "Your access to the course has ended. Your progress is saved, so if you buy the course again you'll pick up where you left off.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function buildRefundDeclinedEmail(input: EmailInput & { note: string }) {
  return {
    to: input.studentEmail,
    subject: `Refund request declined — ${input.courseTitle}`,
    body: [
      `Hi ${input.studentName},`,
      "",
      `We've reviewed your refund request for "${input.courseTitle}" and can't approve it.`,
      "",
      input.note,
      "",
      "You still have full access to the course.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

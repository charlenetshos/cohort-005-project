import { and, eq, isNull } from "drizzle-orm";
import { db as defaultDb } from "~/db";
import { enrollments } from "~/db/schema";

type Database = typeof defaultDb;

// An enrollment row only grants Course Access while it isn't revoked. Approving
// a Refund Request revokes it rather than deleting it, so buying again can
// reinstate the same row with the learner's Progress intact (docs/adr/0001).

/** Matches enrollments that currently grant Course Access. */
export const notRevoked = isNull(enrollments.revokedAt);

export function findActiveEnrollment(
  userId: number,
  courseId: number,
  database: Database = defaultDb
) {
  return database
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId),
        notRevoked
      )
    )
    .get();
}

export function hasCourseAccess(
  userId: number,
  courseId: number,
  database: Database = defaultDb
) {
  return !!findActiveEnrollment(userId, courseId, database);
}

/**
 * Grants Course Access. Reinstates a revoked enrollment if there is one,
 * otherwise creates a new one. Throws if the learner already has access.
 */
export function grantCourseAccess(
  userId: number,
  courseId: number,
  database: Database = defaultDb
) {
  const existing = database
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();

  if (existing && existing.revokedAt === null) {
    throw new Error("User is already enrolled in this course");
  }

  if (existing) {
    return database
      .update(enrollments)
      .set({ revokedAt: null })
      .where(eq(enrollments.id, existing.id))
      .returning()
      .get();
  }

  return database
    .insert(enrollments)
    .values({ userId, courseId })
    .returning()
    .get();
}

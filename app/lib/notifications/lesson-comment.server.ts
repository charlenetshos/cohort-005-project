import { eq } from "drizzle-orm";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import type { AppDb } from "./send.server";

// ─── Shared by the Question Notifications (new-question, question-reply) ───

const person = { id: users.id, name: users.name, email: users.email };

/**
 * A comment on a lesson with everything a Question Notification names: its
 * author, the lesson, the course and the course's Instructor.
 */
export function getLessonComment(db: AppDb, commentId: number) {
  const row = db
    .select({
      body: comments.body,
      parentId: comments.parentId,
      author: person,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      instructorId: courses.instructorId,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .innerJoin(lessons, eq(lessons.id, comments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(comments.id, commentId))
    .get();
  if (!row) throw new Error(`Comment ${commentId} not found`);

  return { ...row, url: `/courses/${row.courseSlug}/lessons/${row.lessonId}` };
}

export function getPerson(db: AppDb, userId: number) {
  const found = db.select(person).from(users).where(eq(users.id, userId)).get();
  if (!found) throw new Error(`User ${userId} not found`);
  return found;
}

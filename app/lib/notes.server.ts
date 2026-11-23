import { and, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "~/db";
import { courses, lessons, modules, notes } from "~/db/schema";
import { noteBodySchema } from "~/lib/notes";

// ─── Notes ───
// A Student's own writing about a Lesson, private to the Student who wrote
// it. One per Student per Lesson, held by the unique index on
// (user_id, lesson_id). See GLOSSARY.md.
//
// Only the owning Student's Lesson page and Saved page may read Note bodies.
// No Instructor or Platform Admin view calls into this module.
//
// Callers check content access before calling.

type Database = typeof defaultDb;

export function getNote(
  userId: number,
  lessonId: number,
  database: Database = defaultDb
) {
  return database
    .select({ body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult =
  | { ok: true; note: { body: string; updatedAt: string } | null }
  | { ok: false; error: string };

/**
 * Creates the Note, or replaces its body and moves `updatedAt` on. A body
 * that is empty after trimming removes the Note, so the box reads empty
 * again. A body over the cap is refused.
 */
export function saveNote(
  userId: number,
  lessonId: number,
  body: string,
  now: Date,
  database: Database = defaultDb
): SaveNoteResult {
  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (parsed.data.length === 0) {
    database
      .delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
      .run();
    return { ok: true, note: null };
  }

  const at = now.toISOString();
  const saved = database
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: parsed.data,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: parsed.data, updatedAt: at },
    })
    .returning({ body: notes.body, updatedAt: notes.updatedAt })
    .get();
  return { ok: true, note: saved };
}

/** The Student's Notes, most recently edited first, each with the Lesson and Course it belongs to. */
export function listNotes(userId: number, database: Database = defaultDb) {
  return database
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(notes)
    .innerJoin(lessons, eq(lessons.id, notes.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  isBookmarked,
  listBookmarks,
  toggleBookmark,
} from "./bookmarks.server";
import { getNote, listNotes, saveNote } from "./notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;
// The services are typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof listNotes>[1]>;
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);
const LATEST = new Date(2026, 9, 8, 18, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("adds a Bookmark, then removes it on the second toggle", () => {
    expect(toggleBookmark(base.user.id, lessonIds[0], NOW, asDb(db))).toBe(
      true
    );
    expect(isBookmarked(base.user.id, lessonIds[0], asDb(db))).toBe(true);

    expect(toggleBookmark(base.user.id, lessonIds[0], LATER, asDb(db))).toBe(
      false
    );
    expect(isBookmarked(base.user.id, lessonIds[0], asDb(db))).toBe(false);
  });

  it("never leaves a Student with two Bookmarks on one Lesson", () => {
    toggleBookmark(base.user.id, lessonIds[0], NOW, asDb(db));
    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
    expect(listBookmarks(base.user.id, asDb(db))).toHaveLength(1);
  });

  it("lists only the Student's own Bookmarks, newest first, with Lesson and Course", () => {
    const other = addStudent("Ben");
    toggleBookmark(base.user.id, lessonIds[0], NOW, asDb(db));
    toggleBookmark(base.user.id, lessonIds[2], LATER, asDb(db));
    toggleBookmark(other.id, lessonIds[1], LATEST, asDb(db));

    expect(listBookmarks(base.user.id, asDb(db))).toMatchObject([
      {
        lessonId: lessonIds[2],
        lessonTitle: "Lesson 3",
        courseTitle: base.course.title,
        courseSlug: base.course.slug,
      },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1" },
    ]);
  });
});

describe("saving a Note", () => {
  it("creates a Note the first time, trimmed", () => {
    const result = saveNote(
      base.user.id,
      lessonIds[0],
      "  first thoughts  ",
      NOW,
      asDb(db)
    );

    expect(result).toEqual({
      ok: true,
      note: { body: "first thoughts", updatedAt: NOW.toISOString() },
    });
    expect(getNote(base.user.id, lessonIds[0], asDb(db))).toEqual({
      body: "first thoughts",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(base.user.id, lessonIds[0], "first", NOW, asDb(db));
    saveNote(base.user.id, lessonIds[0], "second", LATER, asDb(db));

    expect(getNote(base.user.id, lessonIds[0], asDb(db))).toEqual({
      body: "second",
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(base.user.id, asDb(db))).toHaveLength(1);
  });

  it("keeps the text exactly as typed, Markdown characters included", () => {
    saveNote(
      base.user.id,
      lessonIds[0],
      "# not a heading\n*not bold*",
      NOW,
      asDb(db)
    );

    expect(getNote(base.user.id, lessonIds[0], asDb(db))?.body).toBe(
      "# not a heading\n*not bold*"
    );
  });

  it("accepts a Note of exactly the cap and refuses one character more", () => {
    expect(
      saveNote(
        base.user.id,
        lessonIds[0],
        "a".repeat(MAX_NOTE_LENGTH),
        NOW,
        asDb(db)
      )
    ).toMatchObject({ ok: true });

    const refused = saveNote(
      base.user.id,
      lessonIds[1],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      NOW,
      asDb(db)
    );
    expect(refused).toEqual({
      ok: false,
      error: "A note must be 2,000 characters or fewer.",
    });
    expect(getNote(base.user.id, lessonIds[1], asDb(db))).toBeUndefined();
  });

  it("removes the Note when saved empty", () => {
    saveNote(base.user.id, lessonIds[0], "something", NOW, asDb(db));
    saveNote(base.user.id, lessonIds[0], "   ", LATER, asDb(db));

    expect(getNote(base.user.id, lessonIds[0], asDb(db))).toBeUndefined();
  });

  it("lists only the Student's own Notes, last edited first, with Lesson and Course", () => {
    const other = addStudent("Ben");
    saveNote(base.user.id, lessonIds[0], "old", NOW, asDb(db));
    saveNote(base.user.id, lessonIds[1], "newer", LATER, asDb(db));
    saveNote(other.id, lessonIds[2], "not mine", LATEST, asDb(db));
    saveNote(base.user.id, lessonIds[0], "edited last", LATEST, asDb(db));

    expect(listNotes(base.user.id, asDb(db))).toMatchObject([
      {
        lessonId: lessonIds[0],
        body: "edited last",
        courseTitle: base.course.title,
        courseSlug: base.course.slug,
      },
      { lessonId: lessonIds[1], body: "newer" },
    ]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notifyNewQuestion } from "./new-question.server";
import { inMemoryStore, type NotificationStore } from "./store.server";

type TestDb = ReturnType<typeof createTestDb>;
// The module is typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof notifyNewQuestion>[1]>["db"];
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

let testDb: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;
let store: NotificationStore;

function postComment(userId: number, body: string) {
  return testDb
    .insert(schema.comments)
    .values({ userId, lessonId: lesson.id, body })
    .returning()
    .get();
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  const module = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "State and Effects", position: 1 })
    .returning()
    .get();
  store = inMemoryStore();
});

describe("notifyNewQuestion", () => {
  it("tells the course's Instructor, and nobody else, that a Student asked a Question", async () => {
    const question = postComment(base.user.id, "Why reset the state here?");

    await notifyNewQuestion({ commentId: question.id }, { db: asDb(testDb), store });

    expect(await store.list(base.instructor.id)).toEqual([
      expect.objectContaining({
        kind: "new-question",
        data: {
          studentName: "Test User",
          lessonTitle: "State and Effects",
          courseTitle: "Test Course",
          questionText: "Why reset the state here?",
          url: `/courses/test-course/lessons/${lesson.id}`,
        },
        readAt: null,
      }),
    ]);
    expect(await store.list(base.user.id)).toEqual([]);
  });

  it("does not notify the Instructor about a Question on their own lesson", async () => {
    const question = postComment(base.instructor.id, "Any questions so far?");

    await notifyNewQuestion({ commentId: question.id }, { db: asDb(testDb), store });

    expect(await store.list(base.instructor.id)).toEqual([]);
  });

  it("keeps the Question, lesson and course as they were when it was sent", async () => {
    const question = postComment(base.user.id, "Why reset the state here?");

    await notifyNewQuestion({ commentId: question.id }, { db: asDb(testDb), store });
    testDb.update(schema.comments).set({ body: "Edited", deletedAt: "2026-01-01" }).run();
    testDb.update(schema.lessons).set({ title: "Renamed Lesson" }).run();
    testDb.update(schema.courses).set({ title: "Renamed Course" }).run();

    const [notification] = await store.list(base.instructor.id);
    expect(notification.data).toMatchObject({
      questionText: "Why reset the state here?",
      lessonTitle: "State and Effects",
      courseTitle: "Test Course",
      url: `/courses/test-course/lessons/${lesson.id}`,
    });
  });
});

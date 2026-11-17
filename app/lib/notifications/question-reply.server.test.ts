import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notifyQuestionReply } from "./question-reply.server";
import { inMemoryStore, type NotificationStore } from "./store.server";

type TestDb = ReturnType<typeof createTestDb>;
// The module is typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof notifyQuestionReply>[1]>["db"];
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

let testDb: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lesson: typeof schema.lessons.$inferSelect;
let store: NotificationStore;

function postComment(userId: number, body: string, parentId: number | null = null) {
  return testDb
    .insert(schema.comments)
    .values({ userId, lessonId: lesson.id, parentId, body })
    .returning()
    .get();
}

function insertStudent(name: string) {
  return testDb
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
      role: schema.UserRole.Student,
    })
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

describe("notifyQuestionReply", () => {
  it("tells the Question's author, and nobody else, that someone replied", async () => {
    const question = postComment(base.user.id, "Why reset the state here?");
    const reply = postComment(base.instructor.id, "See the next lesson.", question.id);

    await notifyQuestionReply({ commentId: reply.id }, { db: asDb(testDb), store });

    expect(await store.list(base.user.id)).toEqual([
      expect.objectContaining({
        kind: "question-reply",
        data: {
          replierName: "Test Instructor",
          lessonTitle: "State and Effects",
          courseTitle: "Test Course",
          replyText: "See the next lesson.",
          url: `/courses/test-course/lessons/${lesson.id}`,
        },
        readAt: null,
      }),
    ]);
    expect(await store.list(base.instructor.id)).toEqual([]);
  });

  it("tells the author about a reply from another Student too", async () => {
    const bo = insertStudent("Bo Student");
    const question = postComment(base.user.id, "Why reset the state here?");
    const reply = postComment(bo.id, "I wondered too.", question.id);

    await notifyQuestionReply({ commentId: reply.id }, { db: asDb(testDb), store });

    expect(await store.list(base.user.id)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ replierName: "Bo Student" }),
      }),
    ]);
    expect(await store.list(base.instructor.id)).toEqual([]);
  });

  it("does not notify someone replying to their own Question", async () => {
    const question = postComment(base.user.id, "Why reset the state here?");
    const reply = postComment(base.user.id, "Never mind, got it.", question.id);

    await notifyQuestionReply({ commentId: reply.id }, { db: asDb(testDb), store });

    expect(await store.list(base.user.id)).toEqual([]);
    expect(await store.list(base.instructor.id)).toEqual([]);
  });

  it("keeps the reply, lesson and course as they were when it was sent", async () => {
    const question = postComment(base.user.id, "Why reset the state here?");
    const reply = postComment(base.instructor.id, "See the next lesson.", question.id);

    await notifyQuestionReply({ commentId: reply.id }, { db: asDb(testDb), store });
    testDb.update(schema.comments).set({ body: "Edited", deletedAt: "2026-01-01" }).run();
    testDb.update(schema.lessons).set({ title: "Renamed Lesson" }).run();
    testDb.update(schema.courses).set({ title: "Renamed Course" }).run();

    const [notification] = await store.list(base.user.id);
    expect(notification.data).toMatchObject({
      replyText: "See the next lesson.",
      lessonTitle: "State and Effects",
      courseTitle: "Test Course",
      url: `/courses/test-course/lessons/${lesson.id}`,
    });
  });
});

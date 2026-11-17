import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { notifyNewRefundRequest } from "./new-refund-request.server";
import { inMemoryStore, type NotificationStore } from "./store.server";

type TestDb = ReturnType<typeof createTestDb>;
// The module is typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof notifyNewRefundRequest>[1]>["db"];
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

let testDb: TestDb;
let base: ReturnType<typeof seedBaseData>;
let store: NotificationStore;

function insertUser(name: string, role: schema.UserRole) {
  return testDb
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase().replace(" ", ".")}@example.com`, role })
    .returning()
    .get();
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  store = inMemoryStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifyNewRefundRequest", () => {
  it("tells every Admin, and nobody else, that the Student asked for a Refund", async () => {
    const ada = insertUser("Ada Admin", schema.UserRole.Admin);
    const bea = insertUser("Bea Admin", schema.UserRole.Admin);

    await notifyNewRefundRequest(
      { studentId: base.user.id, courseId: base.course.id, reason: "Not what I expected." },
      { db: asDb(testDb), store }
    );

    const expected = {
      kind: "new-refund-request",
      data: {
        studentName: "Test User",
        courseTitle: "Test Course",
        reason: "Not what I expected.",
        url: "/admin/refunds",
      },
      readAt: null,
    };
    expect(await store.list(ada.id)).toEqual([expect.objectContaining(expected)]);
    expect(await store.list(bea.id)).toEqual([expect.objectContaining(expected)]);
    expect(await store.list(base.user.id)).toEqual([]);
    expect(await store.list(base.instructor.id)).toEqual([]);
  });

  it("does not notify an Admin about their own Refund Request", async () => {
    const ada = insertUser("Ada Admin", schema.UserRole.Admin);
    const bea = insertUser("Bea Admin", schema.UserRole.Admin);

    await notifyNewRefundRequest(
      { studentId: ada.id, courseId: base.course.id, reason: "Bought it twice." },
      { db: asDb(testDb), store }
    );

    expect(await store.list(ada.id)).toEqual([]);
    expect(await store.list(bea.id)).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ studentName: "Ada Admin" }),
      }),
    ]);
  });

  it("keeps the names as they were when it was sent", async () => {
    const ada = insertUser("Ada Admin", schema.UserRole.Admin);

    await notifyNewRefundRequest(
      { studentId: base.user.id, courseId: base.course.id, reason: "Not what I expected." },
      { db: asDb(testDb), store }
    );
    testDb.update(schema.courses).set({ title: "Renamed Course" }).run();
    testDb.update(schema.users).set({ name: "Renamed Student" }).run();

    const [notification] = await store.list(ada.id);
    expect(notification.data).toMatchObject({
      studentName: "Test User",
      courseTitle: "Test Course",
    });
  });

  it("logs a failure instead of throwing", async () => {
    const ada = insertUser("Ada Admin", schema.UserRole.Admin);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenStore: NotificationStore = {
      ...store,
      add: () => Promise.reject(new Error("Knock is down")),
    };

    await expect(
      notifyNewRefundRequest(
        { studentId: base.user.id, courseId: base.course.id, reason: "Not what I expected." },
        { db: asDb(testDb), store: brokenStore }
      )
    ).resolves.toBeUndefined();

    expect(errors).toHaveBeenCalledWith(
      `[notifications] failed kind=new-refund-request recipients=${ada.id} error=Knock is down`
    );
  });
});

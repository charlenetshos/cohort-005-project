import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { approveRefundRequest, declineRefundRequest } from "~/lib/refunds.server";
import {
  notifyRefundRequestApproved,
  notifyRefundRequestDeclined,
} from "./refund-request-decided.server";
import { inMemoryStore, type NotificationStore } from "./store.server";

type TestDb = ReturnType<typeof createTestDb>;
// The module is typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof notifyRefundRequestApproved>[1]>["db"];
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

let testDb: TestDb;
let base: ReturnType<typeof seedBaseData>;
let store: NotificationStore;
let admin: typeof schema.users.$inferSelect;

function insertUser(name: string, role: schema.UserRole) {
  return testDb
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase().replace(" ", ".")}@example.com`, role })
    .returning()
    .get();
}

function raiseRefundRequest(buyerId: number, { teamLicence = false } = {}) {
  const purchase = testDb
    .insert(schema.purchases)
    .values({ userId: buyerId, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
  if (teamLicence) {
    const team = testDb.insert(schema.teams).values({}).returning().get();
    testDb
      .insert(schema.coupons)
      .values({ teamId: team.id, courseId: base.course.id, purchaseId: purchase.id, code: "seat-1" })
      .run();
  }
  return testDb
    .insert(schema.refunds)
    .values({ purchaseId: purchase.id, reason: "Not what I expected." })
    .returning()
    .get();
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  store = inMemoryStore();
  admin = insertUser("Ada Admin", schema.UserRole.Admin);
});

describe("notifyRefundRequestApproved", () => {
  it("tells the Student their Refund is on its way, with the amount and the course page", async () => {
    const request = raiseRefundRequest(base.user.id);
    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    await notifyRefundRequestApproved(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );

    expect(await store.list(base.user.id)).toEqual([
      expect.objectContaining({
        kind: "refund-request-approved",
        data: {
          courseTitle: "Test Course",
          courseSlug: "test-course",
          amount: 7900,
          isTeamLicence: false,
          url: "/courses/test-course",
        },
        readAt: null,
      }),
    ]);
    expect(await store.list(admin.id)).toEqual([]);
    expect(await store.list(base.instructor.id)).toEqual([]);
  });

  it("tells the team Admin who bought a Team Licence, marking it as a Team Licence", async () => {
    const buyer = insertUser("Tom Teamlead", schema.UserRole.Student);
    const request = raiseRefundRequest(buyer.id, { teamLicence: true });
    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    await notifyRefundRequestApproved(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );

    expect(await store.list(buyer.id)).toEqual([
      expect.objectContaining({
        kind: "refund-request-approved",
        data: expect.objectContaining({ isTeamLicence: true, amount: 7900 }),
      }),
    ]);
  });

  it("does not notify an Admin who approved their own Refund Request", async () => {
    const request = raiseRefundRequest(admin.id);
    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    await notifyRefundRequestApproved(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );

    expect(await store.list(admin.id)).toEqual([]);
  });

  it("keeps the course title and amount as they were when it was sent", async () => {
    const request = raiseRefundRequest(base.user.id);
    approveRefundRequest(request.id, admin.id, new Date(), asDb(testDb));

    await notifyRefundRequestApproved(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );
    testDb.update(schema.courses).set({ title: "Renamed Course" }).run();
    testDb.update(schema.refunds).set({ amountRefunded: 1 }).run();

    const [notification] = await store.list(base.user.id);
    expect(notification.data).toMatchObject({ courseTitle: "Test Course", amount: 7900 });
  });
});

describe("notifyRefundRequestDeclined", () => {
  it("tells the Student it was declined, quoting the Admin's note, with the course page", async () => {
    const request = raiseRefundRequest(base.user.id);
    declineRefundRequest(request.id, admin.id, "Past our refund limits.", new Date(), asDb(testDb));

    await notifyRefundRequestDeclined(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );

    expect(await store.list(base.user.id)).toEqual([
      expect.objectContaining({
        kind: "refund-request-declined",
        data: {
          courseTitle: "Test Course",
          courseSlug: "test-course",
          note: "Past our refund limits.",
          url: "/courses/test-course",
        },
        readAt: null,
      }),
    ]);
    expect(await store.list(admin.id)).toEqual([]);
  });

  it("tells the team Admin who bought a Team Licence", async () => {
    const buyer = insertUser("Tom Teamlead", schema.UserRole.Student);
    const request = raiseRefundRequest(buyer.id, { teamLicence: true });
    declineRefundRequest(request.id, admin.id, "Seats already claimed.", new Date(), asDb(testDb));

    await notifyRefundRequestDeclined(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );

    expect(await store.list(buyer.id)).toEqual([
      expect.objectContaining({ kind: "refund-request-declined" }),
    ]);
  });

  it("does not notify an Admin who declined their own Refund Request", async () => {
    const request = raiseRefundRequest(admin.id);
    declineRefundRequest(request.id, admin.id, "Changed my mind.", new Date(), asDb(testDb));

    await notifyRefundRequestDeclined(
      { refundId: request.id, adminId: admin.id },
      { db: asDb(testDb), store }
    );

    expect(await store.list(admin.id)).toEqual([]);
  });
});

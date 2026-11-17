import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { claimSeat } from "~/lib/seats.server";
import { notifySeatClaimed } from "./seat-claimed.server";
import { inMemoryStore, type NotificationStore } from "./store.server";

type TestDb = ReturnType<typeof createTestDb>;
// The module is typed against the app's db; the test db has the same shape.
type AppDb = NonNullable<Parameters<typeof notifySeatClaimed>[1]>["db"];
const asDb = (testDb: TestDb) => testDb as unknown as AppDb;

let testDb: TestDb;
let base: ReturnType<typeof seedBaseData>;
let store: NotificationStore;
let ana: typeof schema.users.$inferSelect;
let ben: typeof schema.users.$inferSelect;
let seatCodes: string[];

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

function claim(code: string, userId: number) {
  expect(claimSeat(code, userId, "", asDb(testDb)).ok).toBe(true);
}

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  store = inMemoryStore();

  // Ana, a team Admin, buys a Team Licence of 3 Seats; Ben is on her team.
  ana = insertStudent("Ana Buyer");
  ben = insertStudent("Ben Member");
  const licence = testDb
    .insert(schema.purchases)
    .values({ userId: ana.id, courseId: base.course.id, amountPaid: 7900, country: null })
    .returning()
    .get();
  const team = testDb.insert(schema.teams).values({}).returning().get();
  testDb
    .insert(schema.teamMembers)
    .values({ teamId: team.id, userId: ana.id, role: schema.TeamMemberRole.Admin })
    .run();
  seatCodes = ["seat-1", "seat-2", "seat-3"];
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifySeatClaimed", () => {
  it("tells the team Admin who bought the Team Licence, and nobody else, that a Seat was claimed", async () => {
    claim(seatCodes[0], ben.id);

    await notifySeatClaimed({ code: seatCodes[0] }, { db: asDb(testDb), store });

    expect(await store.list(ana.id)).toEqual([
      expect.objectContaining({
        kind: "seat-claimed",
        data: {
          claimerName: "Ben Member",
          courseTitle: "Test Course",
          claimed: 1,
          total: 3,
          url: "/team",
        },
        readAt: null,
      }),
    ]);
    expect(await store.list(ben.id)).toEqual([]);
    expect(await store.list(base.user.id)).toEqual([]);
  });

  it("does not notify the buyer about claiming a Seat themself", async () => {
    claim(seatCodes[0], ana.id);

    await notifySeatClaimed({ code: seatCodes[0] }, { db: asDb(testDb), store });

    expect(await store.list(ana.id)).toEqual([]);
  });

  it("keeps the claimed count and total as they were at that moment", async () => {
    const cleo = insertStudent("Cleo Member");
    claim(seatCodes[0], ben.id);
    await notifySeatClaimed({ code: seatCodes[0] }, { db: asDb(testDb), store });
    claim(seatCodes[1], cleo.id);
    await notifySeatClaimed({ code: seatCodes[1] }, { db: asDb(testDb), store });
    testDb.update(schema.courses).set({ title: "Renamed Course" }).run();
    testDb.update(schema.users).set({ name: "Renamed Member" }).run();

    const notifications = await store.list(ana.id);
    expect(notifications.map((notification) => notification.data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ claimerName: "Ben Member", claimed: 1, total: 3 }),
        expect.objectContaining({
          claimerName: "Cleo Member",
          courseTitle: "Test Course",
          claimed: 2,
          total: 3,
        }),
      ])
    );
    expect(notifications).toHaveLength(2);
  });

  it("sends nothing for a Seat Code nobody has claimed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await notifySeatClaimed({ code: seatCodes[0] }, { db: asDb(testDb), store });

    expect(await store.list(ana.id)).toEqual([]);
  });
});

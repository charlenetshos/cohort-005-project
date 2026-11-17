import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { localFileStore, type NotificationStore } from "./store.server";
import type { NotificationPayload } from "./payload";

const ada = { id: 7, name: "Ada Admin", email: "ada@example.com" };
const bob = { id: 8, name: "Bob Admin", email: "bob@example.com" };
const liam = { id: 3, name: "Liam", email: "liam@example.com" };

function refundRequest(reason: string): NotificationPayload {
  return {
    kind: "new-refund-request",
    data: {
      studentName: "Liam",
      courseTitle: "Introduction to TypeScript",
      reason,
      url: "/admin/refunds",
    },
  };
}

let directory: string;
let store: NotificationStore;

beforeEach(() => {
  directory = join(mkdtempSync(join(tmpdir(), "notifications-")), ".notifications");
  store = localFileStore(directory);
});

describe("localFileStore", () => {
  it("lists nothing for someone who has never been notified", async () => {
    expect(await store.list(ada.id)).toEqual([]);
  });

  it("adds an unread Notification to each recipient's Feed", async () => {
    await store.add({
      recipients: [ada, bob],
      actor: liam,
      payload: refundRequest("Not what I expected."),
    });

    for (const recipient of [ada, bob]) {
      const feed = await store.list(recipient.id);
      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({
        ...refundRequest("Not what I expected."),
        readAt: null,
      });
      expect(typeof feed[0].id).toBe("string");
      expect(Number.isNaN(Date.parse(feed[0].insertedAt))).toBe(false);
    }
    expect(await store.list(liam.id)).toEqual([]);
  });

  it("keeps one readable JSON file per recipient, named by Knock user id", async () => {
    await store.add({ recipients: [ada], actor: liam, payload: refundRequest("First.") });

    const file = join(directory, "cadence-7.json");
    expect(existsSync(file)).toBe(true);
    const written = JSON.parse(readFileSync(file, "utf8"));
    expect(written).toEqual([
      expect.objectContaining({ kind: "new-refund-request", readAt: null }),
    ]);
  });

  it("lists the newest Notification first, and survives a new store on the same folder", async () => {
    await store.add({ recipients: [ada], actor: liam, payload: refundRequest("First.") });
    await store.add({ recipients: [ada], actor: liam, payload: refundRequest("Second.") });

    const reopened = localFileStore(directory);
    const feed = await reopened.list(ada.id);
    expect(feed.map((n) => n.kind === "new-refund-request" && n.data.reason)).toEqual([
      "Second.",
      "First.",
    ]);
  });

  it("skips anything in a recipient's file that is not a Notification", async () => {
    await store.add({ recipients: [ada], actor: liam, payload: refundRequest("Kept.") });
    const file = join(directory, "cadence-7.json");
    const written = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(
      file,
      JSON.stringify([...written, { id: "x", kind: "new-refund-request", data: {} }, "junk"])
    );

    const feed = await store.list(ada.id);
    expect(feed).toEqual([
      expect.objectContaining({ ...refundRequest("Kept."), readAt: null }),
    ]);
  });

  it("marks chosen Notifications read and unread, for that recipient only", async () => {
    await store.add({ recipients: [ada, bob], actor: liam, payload: refundRequest("First.") });
    await store.add({ recipients: [ada], actor: liam, payload: refundRequest("Second.") });
    const [second, first] = await store.list(ada.id);

    await store.markRead(ada.id, [first.id]);
    let feed = await store.list(ada.id);
    expect(feed.find((n) => n.id === first.id)?.readAt).not.toBeNull();
    expect(feed.find((n) => n.id === second.id)?.readAt).toBeNull();

    await store.markUnread(ada.id, [first.id]);
    feed = await store.list(ada.id);
    expect(feed.every((n) => n.readAt === null)).toBe(true);

    // Someone else's ids do nothing to your Feed.
    const [bobs] = await store.list(bob.id);
    await store.markRead(ada.id, [bobs.id]);
    expect((await store.list(bob.id))[0].readAt).toBeNull();
  });

  it("marks all of one recipient's Notifications read", async () => {
    await store.add({ recipients: [ada, bob], actor: liam, payload: refundRequest("First.") });
    await store.add({ recipients: [ada, bob], actor: liam, payload: refundRequest("Second.") });

    await store.markAllRead(ada.id);

    expect((await store.list(ada.id)).every((n) => n.readAt !== null)).toBe(true);
    expect((await store.list(bob.id)).every((n) => n.readAt === null)).toBe(true);
  });
});

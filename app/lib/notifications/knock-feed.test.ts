import { describe, expect, it } from "vitest";
import { fromKnockFeedItem } from "./knock-feed";

const data = {
  studentName: "Liam",
  courseTitle: "Introduction to TypeScript",
  reason: "Not for me",
  url: "/admin/refunds",
};

describe("fromKnockFeedItem", () => {
  it("reads the kind from the workflow key and keeps the payload as sent", () => {
    expect(
      fromKnockFeedItem({
        id: "msg_1",
        source: { key: "new-refund-request" },
        data,
        inserted_at: "2026-11-17T09:00:00Z",
        read_at: null,
      })
    ).toEqual({
      id: "msg_1",
      kind: "new-refund-request",
      data,
      insertedAt: "2026-11-17T09:00:00Z",
      readAt: null,
    });
  });

  it("keeps when it was read", () => {
    expect(
      fromKnockFeedItem({
        id: "msg_1",
        source: { key: "new-refund-request" },
        data,
        inserted_at: "2026-11-17T09:00:00Z",
        read_at: "2026-11-17T10:00:00Z",
      })?.readAt
    ).toBe("2026-11-17T10:00:00Z");
  });

  it("drops an item with no data, which Cadence cannot show", () => {
    expect(
      fromKnockFeedItem({
        id: "msg_2",
        source: { key: "new-refund-request" },
        data: null,
        inserted_at: "2026-11-17T09:00:00Z",
        read_at: null,
      })
    ).toBeNull();
  });
});

// ─── Notification payloads (browser-safe) ───
// One variant per kind of Notification. The kind is also the Knock workflow
// key. Values are kept as they were when the Notification was sent; only `url`
// points at the thing's current state.
//
// To add a kind: add one variant to `NotificationPayload` below, then its
// entry in `app/components/notification-feed/kinds.tsx` (wording and icon) and
// a notify function in `app/lib/notifications/<kind>.server.ts`.

export type NotificationPayload =
  // ── new-refund-request: a Student raised a Refund Request → every Admin ──
  | {
      kind: "new-refund-request";
      data: {
        studentName: string;
        courseTitle: string;
        reason: string;
        url: string;
      };
    };
// ── more kinds go here, one variant each ──

export type NotificationKind = NotificationPayload["kind"];

export type PayloadOf<K extends NotificationKind> = Extract<
  NotificationPayload,
  { kind: K }
>;

/** A Notification as one recipient's Feed sees it. */
export type FeedNotification = NotificationPayload & {
  id: string;
  insertedAt: string;
  readAt: string | null;
};

/** Every user is known to Knock (and named in local files) as `cadence-<id>` (ADR 0014). */
export function knockUserId(userId: number): string {
  return `cadence-${userId}`;
}

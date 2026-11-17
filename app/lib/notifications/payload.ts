import { z } from "zod";

// ─── Notification payloads (browser-safe) ───
// One variant per kind of Notification. The kind is also the Knock workflow
// key. Values are kept as they were when the Notification was sent; only `url`
// points at the thing's current state.
//
// The schema is the source of truth: the types below are derived from it, and
// anything read back from Knock, a local file or the network is parsed with it.
//
// To add a kind: add one variant to `notificationPayload` below, then its
// entry in `app/components/notification-feed/kinds.tsx` (wording and icon) and
// a notify function in `app/lib/notifications/<kind>.server.ts`.

export const notificationPayload = z.discriminatedUnion("kind", [
  // ── new-refund-request: a Student raised a Refund Request → every Admin ──
  z.object({
    kind: z.literal("new-refund-request"),
    data: z.object({
      studentName: z.string(),
      courseTitle: z.string(),
      reason: z.string(),
      url: z.string(),
    }),
  }),
  // ── refund-request-approved: an Admin approved a Refund Request → whoever raised it ──
  z.object({
    kind: z.literal("refund-request-approved"),
    data: z.object({
      courseTitle: z.string(),
      courseSlug: z.string(),
      /** Cents refunded. */
      amount: z.number(),
      isTeamLicence: z.boolean(),
      url: z.string(),
    }),
  }),
  // ── refund-request-declined: an Admin declined a Refund Request → whoever raised it ──
  z.object({
    kind: z.literal("refund-request-declined"),
    data: z.object({
      courseTitle: z.string(),
      courseSlug: z.string(),
      note: z.string(),
      url: z.string(),
    }),
  }),
  // ── new-question: a Student asked a Question on a lesson → the course's Instructor ──
  z.object({
    kind: z.literal("new-question"),
    data: z.object({
      studentName: z.string(),
      lessonTitle: z.string(),
      courseTitle: z.string(),
      questionText: z.string(),
      url: z.string(),
    }),
  }),
  // ── question-reply: someone replied to a Question → the Question's author ──
  z.object({
    kind: z.literal("question-reply"),
    data: z.object({
      replierName: z.string(),
      lessonTitle: z.string(),
      courseTitle: z.string(),
      replyText: z.string(),
      url: z.string(),
    }),
  }),
  // ── seat-claimed: someone claimed a Seat on a Team Licence → the team Admin who bought it ──
  z.object({
    kind: z.literal("seat-claimed"),
    data: z.object({
      claimerName: z.string(),
      courseTitle: z.string(),
      /** Seats claimed on the Team Licence, this one included, at that moment. */
      claimed: z.number(),
      total: z.number(),
      url: z.string(),
    }),
  }),
  // ── more kinds go here, one variant each ──
]);

export type NotificationPayload = z.infer<typeof notificationPayload>;

export type NotificationKind = NotificationPayload["kind"];

export type PayloadOf<K extends NotificationKind> = Extract<
  NotificationPayload,
  { kind: K }
>;

const feedFields = z.object({
  id: z.string(),
  insertedAt: z.string(),
  readAt: z.string().nullable(),
});

/** A Notification as one recipient's Feed sees it. */
export const feedNotification = z.intersection(notificationPayload, feedFields);

export type FeedNotification = z.infer<typeof feedNotification>;

/**
 * Parses a list of Feed Notifications from outside the type checker's reach
 * (a file, a response), dropping any item that is not a Notification Cadence
 * knows how to show.
 */
export function parseFeedNotifications(value: unknown): FeedNotification[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = feedNotification.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** `readAt` for each Notification after marking the chosen ones read or unread. */
export const markings = {
  read: (ids: string[] | "all", at: string) => (item: FeedNotification) =>
    !item.readAt && (ids === "all" || ids.includes(item.id)) ? { ...item, readAt: at } : item,
  unread: (ids: string[]) => (item: FeedNotification) =>
    ids.includes(item.id) ? { ...item, readAt: null } : item,
};

/** Every user is known to Knock (and named in local files) as `cadence-<id>` (ADR 0014). */
export function knockUserId(userId: number): string {
  return `cadence-${userId}`;
}

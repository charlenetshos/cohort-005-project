import { notificationPayload, type FeedNotification } from "./payload";

// ─── Reading a Knock feed item as a Notification (browser-safe) ───
// The Knock workflow key is the Notification's kind, and the trigger's data is
// its payload data as sent, so a feed item maps straight back.

/** The parts of a Knock feed item Cadence reads. */
export type KnockFeedItemFields = {
  id: string;
  source: { key: string };
  data: Record<string, unknown> | null;
  inserted_at: string;
  read_at: string | null;
};

/** The item as a Notification, or null if it is not one Cadence knows how to show. */
export function fromKnockFeedItem(item: KnockFeedItemFields): FeedNotification | null {
  const payload = notificationPayload.safeParse({ kind: item.source.key, data: item.data });
  if (!payload.success) return null;
  return {
    id: item.id,
    ...payload.data,
    insertedAt: item.inserted_at,
    readAt: item.read_at,
  };
}

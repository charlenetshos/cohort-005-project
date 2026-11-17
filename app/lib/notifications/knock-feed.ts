import type { FeedNotification, NotificationPayload } from "./payload";

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

export function fromKnockFeedItem(item: KnockFeedItemFields): FeedNotification | null {
  if (!item.data) return null;
  // Knock hands back the kind and data Cadence sent it in `add`; it cannot
  // check them against the union, so name that trust once here.
  const payload = { kind: item.source.key, data: item.data } as NotificationPayload;
  return {
    id: item.id,
    ...payload,
    insertedAt: item.inserted_at,
    readAt: item.read_at,
  };
}

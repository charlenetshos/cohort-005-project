import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  knockUserId,
  markings,
  parseFeedNotifications,
  type FeedNotification,
  type NotificationPayload,
} from "./payload";
import { knockApiTrigger, knockStore } from "./knock-store.server";
import { notificationSettings } from "./settings.server";

// ─── Where Notifications go ───
// Knock is the only record of Notifications in a deployed Cadence (ADR 0013).
// Without Knock settings (local dev) each recipient's Notifications live in
// one JSON file in `.notifications/`, named by Knock user id. Tests use the
// in-memory version.

/** Who a Notification is for, or who caused it. Knock identifies users inline from this. */
export type NotificationPerson = { id: number; name: string; email: string };

export type NewNotification = {
  recipients: NotificationPerson[];
  actor: NotificationPerson | null;
  payload: NotificationPayload;
};

/** Where the notify functions send Notifications: Knock, or the local store. */
export interface NotificationWriter {
  add(notification: NewNotification): Promise<void>;
}

/**
 * Reads and marks one recipient's Feed. Only the local store does this on the
 * server; with Knock the browser reads and marks Knock directly.
 */
export interface NotificationFeedReader {
  /** The recipient's Notifications, newest first. */
  list(recipientId: number): Promise<FeedNotification[]>;
  markRead(recipientId: number, ids: string[]): Promise<void>;
  markUnread(recipientId: number, ids: string[]): Promise<void>;
  markAllRead(recipientId: number): Promise<void>;
}

/** A store that keeps the Feeds itself (local files, or memory in tests). */
export type NotificationStore = NotificationWriter & NotificationFeedReader;

/** Each recipient's Feed, newest first, kept under their Knock user id. */
type FeedsByRecipient = {
  read(knockUserId: string): FeedNotification[];
  write(knockUserId: string, feed: FeedNotification[]): void;
};

function storeKeepingFeedsIn(feeds: FeedsByRecipient): NotificationStore {
  function update(
    recipientId: number,
    change: (item: FeedNotification) => FeedNotification
  ) {
    const key = knockUserId(recipientId);
    feeds.write(key, feeds.read(key).map(change));
  }

  return {
    async add({ recipients, payload }) {
      const insertedAt = new Date().toISOString();
      for (const recipient of recipients) {
        const key = knockUserId(recipient.id);
        const item: FeedNotification = {
          id: randomUUID(),
          ...payload,
          insertedAt,
          readAt: null,
        };
        feeds.write(key, [item, ...feeds.read(key)]);
      }
    },
    async list(recipientId) {
      return feeds.read(knockUserId(recipientId));
    },
    async markRead(recipientId, ids) {
      update(recipientId, markings.read(ids, new Date().toISOString()));
    },
    async markUnread(recipientId, ids) {
      update(recipientId, markings.unread(ids));
    },
    async markAllRead(recipientId) {
      update(recipientId, markings.read("all", new Date().toISOString()));
    },
  };
}

export function localFileStore(directory: string): NotificationStore {
  const fileFor = (key: string) => join(directory, `${key}.json`);
  return storeKeepingFeedsIn({
    read(key) {
      const file = fileFor(key);
      if (!existsSync(file)) return [];
      return parseFeedNotifications(JSON.parse(readFileSync(file, "utf8")));
    },
    write(key, feed) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(fileFor(key), JSON.stringify(feed, null, 2));
    },
  });
}

export function inMemoryStore(): NotificationStore {
  const feeds = new Map<string, FeedNotification[]>();
  return storeKeepingFeedsIn({
    read: (key) => feeds.get(key) ?? [],
    write: (key, feed) => void feeds.set(key, feed),
  });
}

export const LOCAL_NOTIFICATIONS_DIRECTORY = ".notifications";

/** The local files in `.notifications/`, for the local Feed's route. */
export function localStore(): NotificationStore {
  return localFileStore(LOCAL_NOTIFICATIONS_DIRECTORY);
}

/** Where Notifications go in this mode: Knock, or the local files. */
export function defaultStore(): NotificationWriter {
  if (notificationSettings.mode === "local") return localStore();
  return knockStore(knockApiTrigger(notificationSettings.secretApiKey));
}

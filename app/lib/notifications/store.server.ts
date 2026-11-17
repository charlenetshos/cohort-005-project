import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  knockUserId,
  type FeedNotification,
  type NotificationPayload,
} from "./payload";
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

export interface NotificationStore {
  add(notification: NewNotification): Promise<void>;
  /** The recipient's Notifications, newest first. */
  list(recipientId: number): Promise<FeedNotification[]>;
  markRead(recipientId: number, ids: string[]): Promise<void>;
  markUnread(recipientId: number, ids: string[]): Promise<void>;
  markAllRead(recipientId: number): Promise<void>;
}

type Shelf = {
  read(key: string): FeedNotification[];
  write(key: string, items: FeedNotification[]): void;
};

function storeOnShelf(shelf: Shelf): NotificationStore {
  function update(
    recipientId: number,
    change: (item: FeedNotification) => FeedNotification
  ) {
    const key = knockUserId(recipientId);
    shelf.write(key, shelf.read(key).map(change));
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
        shelf.write(key, [item, ...shelf.read(key)]);
      }
    },
    async list(recipientId) {
      return shelf.read(knockUserId(recipientId));
    },
    async markRead(recipientId, ids) {
      const now = new Date().toISOString();
      update(recipientId, (item) =>
        ids.includes(item.id) && !item.readAt ? { ...item, readAt: now } : item
      );
    },
    async markUnread(recipientId, ids) {
      update(recipientId, (item) =>
        ids.includes(item.id) ? { ...item, readAt: null } : item
      );
    },
    async markAllRead(recipientId) {
      const now = new Date().toISOString();
      update(recipientId, (item) => (item.readAt ? item : { ...item, readAt: now }));
    },
  };
}

export function localFileStore(directory: string): NotificationStore {
  const fileFor = (key: string) => join(directory, `${key}.json`);
  return storeOnShelf({
    read(key) {
      const file = fileFor(key);
      if (!existsSync(file)) return [];
      return JSON.parse(readFileSync(file, "utf8")) as FeedNotification[];
    },
    write(key, items) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(fileFor(key), JSON.stringify(items, null, 2));
    },
  });
}

export function inMemoryStore(): NotificationStore {
  const shelves = new Map<string, FeedNotification[]>();
  return storeOnShelf({
    read: (key) => shelves.get(key) ?? [],
    write: (key, items) => void shelves.set(key, items),
  });
}

export const LOCAL_NOTIFICATIONS_DIRECTORY = ".notifications";

export function defaultStore(): NotificationStore {
  if (notificationSettings.mode === "local") {
    return localFileStore(LOCAL_NOTIFICATIONS_DIRECTORY);
  }
  // The Knock store arrives with the Knock mode ticket (#26).
  throw new Error("The Knock NotificationStore is not built yet");
}

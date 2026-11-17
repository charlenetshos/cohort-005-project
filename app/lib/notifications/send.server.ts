import type { db as appDb } from "~/db";
import type { NotificationKind, PayloadOf } from "./payload";
import {
  defaultStore,
  type NewNotification,
  type NotificationStore,
} from "./store.server";

// ─── Shared by every notify function ───

export type AppDb = typeof appDb;

/** Every notify function takes these, so tests can pass their own. */
export type NotifyOptions = { db?: AppDb; store?: NotificationStore };

/**
 * Works out the Notification with `build`, drops the actor from its
 * recipients (nobody is notified about their own action) and hands it to the
 * store. Never throws: Notifications are a side effect that must not fail the
 * action that caused them, so a failure is logged and the Notification
 * dropped.
 */
export async function sendNotification<K extends NotificationKind>(
  kind: K,
  store: NotificationStore | undefined,
  build: () => Omit<NewNotification, "payload"> & { payload: PayloadOf<K> }
): Promise<void> {
  let recipientIds: number[] = [];
  try {
    const notification = build();
    const recipients = notification.recipients.filter(
      (recipient) => recipient.id !== notification.actor?.id
    );
    recipientIds = recipients.map((recipient) => recipient.id);
    if (recipients.length === 0) return;

    await (store ?? defaultStore()).add({ ...notification, recipients });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[notifications] failed kind=${kind} recipients=${recipientIds.join(",")} error=${message}`
    );
  }
}

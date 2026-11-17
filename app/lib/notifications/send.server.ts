import type { db as appDb } from "~/db";
import { notificationPayload, type NotificationKind, type PayloadOf } from "./payload";
import {
  defaultStore,
  type NewNotification,
  type NotificationWriter,
} from "./store.server";

// ─── Shared by every notify function ───

export type AppDb = typeof appDb;

/** Every notify function takes these, so tests can pass their own. */
export type NotifyOptions = { db?: AppDb; store?: NotificationWriter };

/** What a notify function works out: who to tell, who caused it, and the kind's data. */
export type NotificationParts<K extends NotificationKind> = Omit<
  NewNotification,
  "payload"
> & { data: PayloadOf<K>["data"] };

/**
 * Works out the Notification with `build`, drops the actor from its
 * recipients (nobody is notified about their own action) and hands it to the
 * store. All of it runs after the calling action has returned (callers do not
 * await it), so a Notification never slows the action down. Never rejects:
 * Notifications are a side effect that must not fail the action that caused
 * them, so a failure is logged and the Notification dropped. The returned
 * promise settles once the work is done, for tests to await.
 */
export function sendNotification<K extends NotificationKind>(
  kind: K,
  store: NotificationWriter | undefined,
  build: () => NotificationParts<K>
): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => void deliver(kind, store, build).finally(resolve));
  });
}

async function deliver<K extends NotificationKind>(
  kind: K,
  store: NotificationWriter | undefined,
  build: () => NotificationParts<K>
): Promise<void> {
  let recipientIds: number[] = [];
  try {
    const { recipients: everyone, actor, data } = build();
    const recipients = everyone.filter((recipient) => recipient.id !== actor?.id);
    recipientIds = recipients.map((recipient) => recipient.id);
    if (recipients.length === 0) return;

    const payload = notificationPayload.parse({ kind, data });
    await (store ?? defaultStore()).add({ recipients, actor, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[notifications] failed kind=${kind} recipients=${recipientIds.join(",")} error=${message}`
    );
  }
}

import { Knock } from "@knocklabs/node";
import { knockUserId } from "./payload";
import type { NotificationPerson, NotificationStore } from "./store.server";

// ─── The Knock NotificationStore ───
// `add` triggers the Knock workflow named after the kind (ADR 0013). Everyone
// is identified to Knock inline, inside the trigger, as `cadence-<id>` with
// their name and email (ADR 0014); Cadence makes no other identify call.
// The Feed reads Knock directly from the browser with a server-signed token,
// so reading and marking never go through this store.

type KnockPerson = { id: string; name: string; email: string };

export type KnockTriggerRequest = {
  recipients: KnockPerson[];
  actor?: KnockPerson;
  data: Record<string, unknown>;
};

/** One Knock workflow trigger. Injected so tests never reach Knock. */
export type KnockTrigger = (
  workflow: string,
  request: KnockTriggerRequest
) => Promise<void>;

/** Triggers through the Knock API with the secret key (keeping the SDK's default retries). */
export function knockApiTrigger(secretApiKey: string): KnockTrigger {
  const knock = new Knock({ apiKey: secretApiKey });
  return async (workflow, request) => {
    await knock.workflows.trigger(workflow, request);
  };
}

function asKnockPerson(person: NotificationPerson): KnockPerson {
  return { id: knockUserId(person.id), name: person.name, email: person.email };
}

function readsFromTheBrowser(): never {
  throw new Error(
    "In Knock mode the Feed reads and marks Notifications in Knock from the browser"
  );
}

export function knockStore(trigger: KnockTrigger): NotificationStore {
  return {
    async add({ recipients, actor, payload }) {
      await trigger(payload.kind, {
        recipients: recipients.map(asKnockPerson),
        ...(actor ? { actor: asKnockPerson(actor) } : {}),
        data: payload.data,
      });
    },
    list: async () => readsFromTheBrowser(),
    markRead: async () => readsFromTheBrowser(),
    markUnread: async () => readsFromTheBrowser(),
    markAllRead: async () => readsFromTheBrowser(),
  };
}

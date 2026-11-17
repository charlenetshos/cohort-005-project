import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { notificationSettings } from "~/lib/notifications/settings.server";
import { localStore } from "~/lib/notifications/store.server";

// The local Feed's resource route. Only ever reads and changes the current
// session's own Notifications. With Knock configured the browser reads Knock
// directly, so this route does not exist.

const markSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("markRead"), id: z.string().min(1) }),
  z.object({ intent: z.literal("markUnread"), id: z.string().min(1) }),
  z.object({ intent: z.literal("markAllRead") }),
]);

async function requireLocalFeedUser(request: Request) {
  if (notificationSettings.mode !== "local") {
    throw data("Not found", { status: 404 });
  }
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel", { status: 401 });
  }
  return userId;
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireLocalFeedUser(request);
  return { notifications: await localStore().list(userId) };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireLocalFeedUser(request);
  const parsed = parseFormData(await request.formData(), markSchema);
  if (!parsed.success) {
    throw data("Invalid request", { status: 400 });
  }

  const store = localStore();
  const mark = parsed.data;
  if (mark.intent === "markRead") await store.markRead(userId, [mark.id]);
  if (mark.intent === "markUnread") await store.markUnread(userId, [mark.id]);
  if (mark.intent === "markAllRead") await store.markAllRead(userId);

  return { ok: true };
}

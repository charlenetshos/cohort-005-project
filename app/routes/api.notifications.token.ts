import { data } from "react-router";
import type { Route } from "./+types/api.notifications.token";
import { getCurrentUserId } from "~/lib/session";
import { getFeedConfig } from "~/lib/notifications/feed-config.server";
import { notificationSettings } from "~/lib/notifications/settings.server";

// A fresh Knock user token for the Feed, called when the old one is about to
// expire. Only ever signs for the current session's user: there is no way to
// ask for anyone else's token. Without Knock settings this route does not
// exist.

export async function loader({ request }: Route.LoaderArgs) {
  if (notificationSettings.mode !== "knock") {
    throw data("Not found", { status: 404 });
  }
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel", { status: 401 });
  }

  const config = await getFeedConfig(userId);
  if (config.mode !== "knock") throw data("Not found", { status: 404 });

  return { token: config.token };
}

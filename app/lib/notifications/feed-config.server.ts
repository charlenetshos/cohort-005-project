import type { FeedConfig } from "./feed-config";
import { notificationSettings } from "./settings.server";

/**
 * The Feed configuration for a logged-in user. Knock mode (a signed token for
 * `cadence-<id>`) arrives with #26; until then a Knock-configured server shows
 * no Feed.
 */
export function getFeedConfig(_userId: number): FeedConfig | null {
  if (notificationSettings.mode === "local") return { mode: "local" };
  return null;
}

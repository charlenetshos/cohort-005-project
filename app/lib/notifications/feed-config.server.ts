import { signUserToken } from "@knocklabs/node";
import type { FeedConfig } from "./feed-config";
import { knockUserId } from "./payload";
import type { NotificationSettings } from "./settings";
import { notificationSettings } from "./settings.server";

/** A Knock user token lasts 1 hour; the Feed refreshes it before then. */
export const KNOCK_TOKEN_LIFETIME_SECONDS = 60 * 60;

/** Signs a Knock user token. Injected so tests never sign a real one. */
export type SignKnockToken = (
  userId: string,
  options: { signingKey: string; expiresInSeconds: number }
) => Promise<string>;

/**
 * The Feed configuration for a logged-in user. With Knock configured it carries
 * a token signed on the server for `cadence-<id>` only, so with enhanced
 * security mode on the browser can read no one else's feed.
 */
export async function getFeedConfig(
  userId: number,
  {
    settings = notificationSettings,
    sign = signUserToken,
  }: { settings?: NotificationSettings; sign?: SignKnockToken } = {}
): Promise<FeedConfig> {
  if (settings.mode === "local") return { mode: "local" };

  const knockId = knockUserId(userId);
  return {
    mode: "knock",
    userId: knockId,
    token: await sign(knockId, {
      signingKey: settings.signingKey,
      expiresInSeconds: KNOCK_TOKEN_LIFETIME_SECONDS,
    }),
    publicKey: settings.publicApiKey,
    channelId: settings.feedChannelId,
  };
}

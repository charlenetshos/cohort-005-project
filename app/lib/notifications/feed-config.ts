// ─── What the browser needs to show the Notification Feed (browser-safe) ───
// The app layout's loader returns one of these for a logged-in user, and
// nothing for a logged-out visitor.

export type FeedConfig =
  | { mode: "local" }
  | {
      mode: "knock";
      /** The Knock user id, `cadence-<id>`. */
      userId: string;
      /** Signed on the server for this user; lasts 1 hour. */
      token: string;
      publicKey: string;
      channelId: string;
    };

/** The resource route the local Feed polls and posts to. */
export const LOCAL_FEED_ROUTE = "/api/notifications";

// ─── Notification settings ───
// Knock delivers Notifications only when all four settings are present. With
// none of them (local dev, tests) a local stand-in keeps Notifications in
// files. Any other combination is a misconfiguration that would silently
// produce an empty Feed, so it throws.
//
// No path aliases in this file: vite.config.ts imports it to fail `npm run dev`
// at startup.

const KNOCK_SETTINGS = [
  "KNOCK_SECRET_API_KEY",
  "KNOCK_PUBLIC_API_KEY",
  "KNOCK_SIGNING_KEY",
  "KNOCK_FEED_CHANNEL_ID",
] as const;

export type NotificationSettings =
  | { mode: "local" }
  | {
      mode: "knock";
      secretApiKey: string;
      publicApiKey: string;
      signingKey: string;
      feedChannelId: string;
    };

export function readNotificationSettings(
  env: Record<string, string | undefined>
): NotificationSettings {
  const present = KNOCK_SETTINGS.filter((name) => Boolean(env[name]));

  if (present.length === 0) return { mode: "local" };

  const [secretApiKey, publicApiKey, signingKey, feedChannelId] =
    KNOCK_SETTINGS.map((name) => env[name]);

  if (!secretApiKey || !publicApiKey || !signingKey || !feedChannelId) {
    const missing = KNOCK_SETTINGS.filter((name) => !env[name]);
    throw new Error(
      `[notifications] Knock is only partly configured. Set all four Knock ` +
        `settings, or none of them to keep Notifications in local files. ` +
        `Missing: ${missing.join(", ")}.`
    );
  }

  return { mode: "knock", secretApiKey, publicApiKey, signingKey, feedChannelId };
}

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { readNotificationSettings } from "./app/lib/notifications/settings";

// Refuse to start the dev server with only some of the Knock settings. The
// production server checks the same thing when it loads its build.
function checkNotificationSettings(): Plugin {
  return {
    name: "cadence:check-notification-settings",
    apply: "serve",
    configResolved(config) {
      readNotificationSettings({
        ...loadEnv(config.mode, config.envDir || process.cwd(), "KNOCK_"),
        ...process.env,
      });
    },
  };
}

export default defineConfig({
  plugins: [
    checkNotificationSettings(),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});

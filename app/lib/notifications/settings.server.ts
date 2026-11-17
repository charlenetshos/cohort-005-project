import { readNotificationSettings } from "./settings";

// Read once, when the server loads this module. With only some of the Knock
// settings present this throws, so the server refuses to start rather than
// serve an empty Feed. (`npm run dev` checks the same thing in vite.config.ts.)
export const notificationSettings = readNotificationSettings(process.env);

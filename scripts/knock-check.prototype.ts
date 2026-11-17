// PROTOTYPE (issue #24) — throwaway. Reads back what Knock delivered to every
// Admin for the new-refund-request workflow, using the secret key.
// Run: npm run knock:check

import Database from "better-sqlite3";
import { Knock } from "@knocklabs/node";

const WORKFLOW = "new-refund-request";
const channelId = process.env.KNOCK_FEED_CHANNEL_ID;
const knock = new Knock({ apiKey: process.env.KNOCK_SECRET_API_KEY });

const admins = new Database("data.db", { readonly: true })
  .prepare("select id, name from users where role = 'admin'")
  .all() as { id: number; name: string }[];

console.log(`Admins in Cadence: ${admins.map((a) => `${a.id} ${a.name}`).join(", ")}\n`);

for (const admin of admins) {
  const messages = [];
  for await (const message of knock.users.listMessages(String(admin.id), {
    source: WORKFLOW,
  })) {
    messages.push(message);
  }
  console.log(`Admin ${admin.id} (${admin.name}): ${messages.length} message(s)`);
  for (const m of messages.slice(0, 5)) {
    console.log(
      `  ${m.inserted_at}  status=${m.status}  channel=${m.channel_id === channelId ? "in-app feed" : m.channel_id}  read=${Boolean(m.read_at)}  data=${JSON.stringify(m.data)}`
    );
  }
}

---
status: proposed
---

# Use Knock for in-app Notifications

Cadence sends its Notifications through Knock and builds the Notification Feed on Knock's realtime in-app feed, because the company already uses Knock. This is proposed, not accepted: it becomes accepted only if a working prototype of Knock in Cadence shows it fits. If the prototype says otherwise, a Cadence-owned feed is the fallback. A Cadence-owned feed in SQLite would have been cheaper and would have worked without credentials, but we chose not to run a second notification system alongside the one the company already has.

## Considered Options

- **A Cadence-owned feed (SQLite through Drizzle, our own UI).** Costs nothing, works without credentials in local dev and tests, and keeps Notification records next to the actions that create them. Rejected because it would be a second system beside the company's Knock.
- **Novu.** The best of the other hosted providers: its feed accepts Tailwind class strings, it costs $30/mo after the free tier, and it can be self-hosted. Rejected for the same reason as above.
- **Courier.** Rejected: it charges per send from the first send, and its JWTs never expire unless `expires_in` is set.

## Consequences

- Knock has no credential-free mode, so local dev and tests need a Cadence-side stand-in, like the mailer's `.outbox/` fallback.
- The browser reads its own feed with a signed user token, so Knock's enhanced security mode must be on and the server must sign tokens.
- Notification records live with Knock, not in Cadence's database.
- Knock costs $250/mo after the free tier of about 10k Notifications a month.
- Knock pushes new items to an open Feed in real time, so Cadence doesn't poll for them.

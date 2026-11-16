# Which notification providers fit Cadence?

Research for issue #16 (child of map #14, "Wayfinder: In-app Notifications").
Researched 2026-11-16. Pricing pages and package versions change often; re-check before deciding.

**Scope:** in-app Notifications shown in a Notification Feed inside Cadence. Email, push, SMS and user preferences/muting are out of scope and are not weighed.

**Cadence constraints:** React Router app (React 19, Tailwind, Radix UI), one Node server process, SQLite via Drizzle. Email uses Postmark and falls back to writing JSON to `.outbox/` when no token is set. Notifications need a similar path that works without credentials.

This document compares the options. It does not pick one.

## Comparison

| | Knock | Novu | Courier | SuprSend | MagicBell |
|---|---|---|---|---|---|
| **Free tier** | 10,000 messages/mo, $0 [1] | 10,000 workflow runs/mo, $0. Free plan has 24h "activity feed retention" [5] | 10,000 sends/mo, $0 ("Developer") [11] | 10,000 notifications/mo, $0. Feed shows SuprSend branding [15] | 1,000 deliveries/mo, $0 ("Builder"), 1 project [19] |
| **Next tier** | Starter $250/mo, 50k msgs, then $0.005 each [1] | Pro from $30/mo, 30k runs, then $1.20 per 1k [5] | Business: pay as you go at $0.005/send, including the first 10k [11] | Essentials $100/mo, 50k, then $2 per 1k [15] | Startup $249/mo, 50k, then $0.0025 each [19] |
| **Node server SDK** | `@knocklabs/node` 1.41.1 (Apache-2.0) [24] | `@novu/api` 3.20.0. `@novu/node` is deprecated [24] | `@trycourier/courier` 10.0.0 (Apache-2.0) [24] | `@suprsend/node-sdk` 1.15.1 (MIT) [24] | `magicbell-js/project-client` (package `magicbell` 4.5.1) [20][24] |
| **React feed component** | `@knocklabs/react` 0.15.1: `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`. Styled with a prebuilt CSS file, `--rnf-` CSS variables, and `rnf-` classes, plus `renderItem` [3] | `@novu/react` 3.20.0 `<Inbox>` (React 18+, 19 supported). `appearance.elements` takes style objects **or class strings; the docs show Tailwind classes** [6][8] | `@trycourier/courier-react` 9.3.5. Themed with `CourierInboxTheme`, and you can supply your own views [12] | `@suprsend/react` 1.5.0 `<Inbox>`/`NotificationFeed` with a `theme` object prop. `@suprsend/react-inbox` is end of support [16][17] | `@magicbell/react` 1.14.0. Prebuilt CSS, `--magicbell-*` variables, and class overrides [21] |
| **Headless option** | Yes. `useNotifications`, `useNotificationStore`, `useKnockClient` in `@knocklabs/react`, plus `@knocklabs/client` [4] | Yes. Headless hooks in `@novu/react`, plus framework-agnostic `@novu/js` [6] | Yes, as a "custom UI on the low-level APIs". Docs are thinner here [12] | Yes. `@suprsend/react-core` (`useFeedClient`, `useFeed`) and `@suprsend/web-sdk` [17] | No headless React hooks documented. The JS `UserClient` + `Realtime` can be used to build your own UI [20][21] |
| **Credential-free local dev and tests** | No local server or emulator. You need an account. Options are "sandbox mode" per channel or per trigger (`settings.sandbox_mode`), plus separate environments [4b]. Offline use needs a Cadence-side stub | **Self-hostable**: MIT core, Docker [9]. Needs API, Worker and WS services plus MongoDB, Redis (AOF) and S3-compatible storage [10]. Otherwise a Cadence-side stub | No emulator documented. Needs a Cadence-side stub | No emulator documented. Needs a Cadence-side stub | No emulator documented. Needs a Cadence-side stub |
| **Real-time** | Yes, a socket connection managed by the SDK. It can disconnect when the tab is inactive and sync across tabs [3] | Yes, a real-time unread count. A WS service is part of the deployment (`socketUrl` e.g. `wss://eu.socket.novu.co`) [6][7][10] | Yes, a "real-time socket" managed by the SDK [12][13] | Yes, WebSocket via the Inbox or `initializeSocketConnection()`. Shows connection status (`reachability`) [17] | Yes, WebSocket via `magicbell-js/realtime` [20] |
| **Where Notification records live** | Knock cloud. Feed retention is "unlimited, configurable" on all plans [1] | Novu cloud, or your own MongoDB if self-hosted [10] | Courier cloud | SuprSend cloud | MagicBell cloud |
| **How the browser is authorised to read a user's feed** | Public API key + user id. **By default Knock does not require a signed token, so anyone with the public key can read any user's feed.** "Enhanced security mode" requires an RS256 JWT (`sub` = user id) signed on the server with a signing key. `signUserToken` defaults to a 1h expiry. `explicit_grants` can limit the token to `user/feed_read` [2] | `applicationIdentifier` + `subscriberId`. With HMAC enabled, `subscriberHash = HMAC-SHA256(secretKey, subscriberId)` computed on the server. Without it the Inbox will not load [7] | The server calls `POST /auth/issue-token` with scopes such as `user_id:<id> inbox:read:messages inbox:write:events`, and the client calls `signIn({ userId, jwt })`. **Leaving out `expires_in` mints a token that never expires.** The SDK does not refresh tokens [13] | Public key + an ES256 JWT signed on the server (`entity_type: subscriber`, `entity_id`, `exp`, `iat`). Enhanced security mode makes it mandatory. Has a `refreshUserToken` callback [18] | A User JWT signed HS256 with the project Secret Key on the server (`user_external_id`/`user_email`, `api_key`). The docs' example uses a 1-year expiry [22] |

### Note: a provider-less baseline

None of the five gives Cadence an offline, credential-free feed except self-hosted Novu, and that needs MongoDB, Redis and object storage alongside Cadence's single SQLite process [10]. So every option needs a Cadence-side seam, like `mailer.server.ts`, that writes Notifications somewhere local when no token is set. That only works if the **UI reads through that same seam**. The provider's drop-in React component talks directly to the provider's API, so it cannot render a locally stubbed feed. To get a usable local-dev feed, Cadence would either:

- (a) render its own feed UI and get data from a provider's headless client in production and from a stub locally, or
- (b) accept that local dev and tests show no feed unless a dev account key is set.

For the grilling ticket, also note that a Cadence-owned feed (a SQLite `notifications` table read by a loader, real-time via SSE from the single Node process) is a realistic alternative at Cadence's scale. It is not researched here.

## Shortlist (not a decision)

1. **Knock**: the most mature headless React hooks and Node SDK. Free tier is 10k messages/mo with unlimited feed retention. Two catches: its CSS-variable styling does not use Tailwind classes, so you'd go headless with Radix/Tailwind; and enhanced security mode must be switched on deliberately. Big price jump to $250/mo.
2. **Novu**: the only option you can self-host (MIT core) and the only drop-in component that takes Tailwind class strings directly. Also has headless hooks, and the cheapest paid tier ($30/mo). Catches: the free plan's 24h "activity feed retention" (it is unclear whether this limits Inbox history or only the dashboard activity log, so check it), and the self-host stack is heavy compared with Cadence.
3. **Courier**: a free tier comparable to Knock's, Apache-2.0 Node SDK, and scoped, user-bound JWTs. Catch: pay-as-you-go bills every send once you leave the free tier. Headless and styling docs are thinner.

**Considered, not shortlisted:**

- **SuprSend** is close on features (headless core, theme object, WebSocket, ES256 JWT). It was not shortlisted because of recent SDK churn (`@suprsend/react-inbox` is end of support) and branding on the free feed. It is the next option to consider if the shortlist fails.
- **MagicBell** has the smallest free tier (1k deliveries), no documented headless React hooks, and long-lived HS256 tokens in its own examples.

## Facts most likely to decide the choice

1. **Local and test path:** no hosted provider offers a credential-free emulator. A Cadence stub only covers the browser feed if Cadence renders its own UI over a headless client. Novu self-host is the only real offline backend, and it brings MongoDB, Redis and S3.
2. **Restyling to Tailwind/Radix:** Novu's `appearance.elements` accepts Tailwind classes. Everyone else needs CSS-variable overrides or headless hooks (best on Knock, Novu and SuprSend).
3. **Browser auth defaults:** Knock and SuprSend are insecure by default until "enhanced security mode" is on. Courier tokens never expire unless `expires_in` is set. Novu needs HMAC switched on. Each option needs a server-side signing step in a React Router loader.
4. **Cost after the free tier:** Novu $30/mo, SuprSend $100/mo, Courier $0.005/send from the first send, Knock and MagicBell about $250/mo.
5. **Data location:** with every hosted option, the Notification records live with the vendor, not in Cadence's SQLite. That matters for joins, seed data and tests.

## Sources

1. Knock pricing: https://knock.app/pricing
2. Knock: security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
3. Knock: React feed: https://docs.knock.app/in-app-ui/react/feed
4. Knock: headless feed: https://docs.knock.app/in-app-ui/react/headless/feed
4b. Knock: testing workflows (sandbox mode): https://docs.knock.app/send-notifications/testing-workflows
5. Novu pricing: https://novu.co/pricing
6. Novu Inbox overview: https://docs.novu.co/platform/inbox/overview
7. Novu: prepare for production (HMAC): https://docs.novu.co/platform/inbox/prepare-for-production
8. Novu Inbox styling: https://docs.novu.co/platform/inbox/configuration/styling
9. Novu repository (MIT core, `enterprise/` under a commercial license): https://github.com/novuhq/novu
10. Novu self-hosting overview: https://docs.novu.co/community/self-hosting-novu/overview, and cloud vs self-hosted: https://docs.novu.co/community/self-hosted-and-novu-cloud
11. Courier pricing: https://www.courier.com/pricing
12. Courier Inbox overview: https://www.courier.com/docs/platform/inbox/inbox-overview
13. Courier: authenticate users: https://www.courier.com/docs/in-app/authenticate-users
15. SuprSend pricing: https://www.suprsend.com/pricing
16. SuprSend React inbox: https://docs.suprsend.com/docs/inbox-react
17. SuprSend: customising the feed and headless use: https://docs.suprsend.com/docs/react-customize-inbox, https://docs.suprsend.com/docs/js-inapp-feed, and changelog https://docs.suprsend.com/changelog/overview
18. SuprSend client authentication: https://docs.suprsend.com/docs/client-authentication
19. MagicBell pricing: https://www.magicbell.com/pricing
20. MagicBell JS client (project/user/realtime): https://www.magicbell.com/docs/libraries/magicbell-js
21. MagicBell React: https://www.magicbell.com/docs/libraries/magicbell-react
22. MagicBell User JWT: https://www.magicbell.com/docs/api/authentication/user
24. npm registry (`npm view <pkg> version license deprecated`), checked 2026-11-16

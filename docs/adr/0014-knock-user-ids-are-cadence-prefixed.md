# Knock user ids are `cadence-<users.id>`

Every Cadence user is known to Knock as `cadence-<users.id>` (for example `cadence-42`), never as the bare database id or their email. Knock ids can't be renamed, so a change later would orphan every user's Notification Feed. Emails change in Settings. A bare `"42"` would collide with another app's user if Cadence ever shares a Knock environment with the rest of the company. Users are identified to Knock only inline, when a Notification is triggered, so this one id is all Cadence ever sends.

## Considered Options

- **Bare database id (`"42"`).** What the Knock spike used. Rejected: it collides in a shared environment and doesn't say which app a user belongs to.
- **Email.** Unique, but changeable, and Knock ids aren't.
- **A Knock tenant `cadence`.** Rejected: tenants are designed for B2B customers, and every trigger and feed query would have to remember to pass it.

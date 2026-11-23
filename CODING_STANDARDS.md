# Coding standards

## Fail with a thrown response, not a return value

A loader or an action that cannot continue throws. It does not return an
error shape for the component to unpack.

```ts
if (!course) throw data("Course not found", { status: 404 });
```

The route then has one success path. A returned error shape gives every
component a second path to forget about.

## Parse untrusted input with a schema

Form data, search parameters and request bodies get a zod schema before the
values reach any query. Do not read `formData.get("x") as string`. The cast
is a lie the type checker believes.

## Services take the database last, with a default

A function in `app/lib/*.server.ts` types its database from `~/db` and takes it
as the last parameter, defaulting to the real one. Tests pass an in-memory
database; routes leave it out.

```ts
import { db as defaultDb } from "~/db";

type Database = typeof defaultDb;

export function findActiveEnrollment(
  userId: number,
  courseId: number,
  database: Database = defaultDb
) {
```

`enrollments.server.ts` and `seats.server.ts` follow this. A service that puts
the database first, or builds its own type from `drizzle-orm/better-sqlite3`,
reads differently from every other service.

## Do not write `any`, and do not write `!`

Both switch the type checker off at the exact point you are least sure. If a
value can be missing, narrow it with a check. If you cannot name the type,
the shape is wrong — fix the shape.

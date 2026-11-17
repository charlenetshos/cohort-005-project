import { eq } from "drizzle-orm";
import { users } from "~/db/schema";
import type { AppDb } from "./send.server";
import type { NotificationPerson } from "./store.server";

// ─── Shared by every notify function ───

/** The columns that make a NotificationPerson, for a `select`. */
export const personColumns = { id: users.id, name: users.name, email: users.email };

/** The user as a NotificationPerson. Throws if there is no such user. */
export function getPerson(db: AppDb, userId: number): NotificationPerson {
  const found = db.select(personColumns).from(users).where(eq(users.id, userId)).get();
  if (!found) throw new Error(`User ${userId} not found`);
  return found;
}

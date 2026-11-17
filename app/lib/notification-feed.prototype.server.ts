// PROTOTYPE — throwaway. Sample Notifications for the Feed prototype
// (wayfinder ticket "What does the Notification Feed look like?").
// Nothing is stored: real course/lesson/user names are borrowed from the DB
// so the links go somewhere real, and everything else is made up.
import { asc, eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { courses, lessons, modules, users, UserRole } from "~/db/schema";
import {
  kindsFor,
  makeNotification,
  type Ctx,
  type ProtoNotification,
} from "./notification-feed.prototype";

function loadCtx(currentUserId: number): Ctx | null {
  const cs = db
    .select({ id: courses.id, slug: courses.slug, title: courses.title })
    .from(courses)
    .orderBy(asc(courses.id))
    .limit(2)
    .all();
  if (cs.length === 0) return null;
  const l = db
    .select({ id: lessons.id, title: lessons.title })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, cs[0].id))
    .orderBy(asc(modules.position), asc(lessons.position))
    .limit(1)
    .get();
  const others = db
    .select({ name: users.name })
    .from(users)
    .where(ne(users.id, currentUserId))
    .limit(5)
    .all()
    .map((u) => u.name);
  return {
    course: cs[0],
    course2: cs[1] ?? cs[0],
    lesson: {
      id: l?.id ?? 0,
      title: l?.title ?? "Introduction",
      courseSlug: cs[0].slug,
    },
    others: others.length ? others : ["Sam Rivera", "Priya Shah", "Leo Chen"],
  };
}

export function getPrototypeFeed(
  userId: number,
  role: UserRole,
  isTeamAdmin: boolean
) {
  const ctx = loadCtx(userId);
  if (!ctx) return { ctx: null, seed: [] as ProtoNotification[], kinds: [] };
  const kinds = kindsFor(role, isTeamAdmin);
  const ages = [4, 38, 190, 1500, 3000, 9000, 20000];
  const seed = ages.map((m, i) =>
    makeNotification(kinds[i % kinds.length], ctx, i, m, i >= 2)
  );
  return { ctx, seed, kinds };
}

export type PrototypeFeedData = ReturnType<typeof getPrototypeFeed>;

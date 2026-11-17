// PROTOTYPE — throwaway. Shared (browser-safe) half of the Feed prototype
// (wayfinder ticket "What does the Notification Feed look like?").
import { UserRole } from "~/db/schema";

export type ProtoKind =
  | "refund-approved"
  | "refund-declined"
  | "refund-requested"
  | "question-asked"
  | "question-replied"
  | "seat-claimed";

export type ProtoNotification = {
  id: string;
  kind: ProtoKind;
  actor: string | null; // who caused it (null for decisions made by "the team")
  headline: string; // one line, bold bits marked with **
  detail?: string; // optional quote / extra line
  meta?: string; // small secondary line
  href: string;
  cta: string; // what the click does, for variant C's detail pane
  minutesAgo: number;
  read: boolean;
};

export type Ctx = {
  course: { slug: string; title: string };
  course2: { slug: string; title: string };
  lesson: { id: number; title: string; courseSlug: string };
  others: string[];
};

let seq = 0;
const nid = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

export function makeNotification(
  kind: ProtoKind,
  ctx: Ctx,
  i: number,
  minutesAgo: number,
  read: boolean
): ProtoNotification {
  const who = ctx.others[i % ctx.others.length];
  const c = i % 2 === 0 ? ctx.course : ctx.course2;
  const lessonHref = `/courses/${ctx.lesson.courseSlug}/lessons/${ctx.lesson.id}`;
  const base = { id: nid(), kind, minutesAgo, read };
  switch (kind) {
    case "refund-approved":
      return {
        ...base,
        actor: null,
        headline: `Your Refund Request for **${c.title}** was approved`,
        detail: "$49.00 is on its way back to you.",
        href: `/courses/${c.slug}`,
        cta: "View course",
      };
    case "refund-declined":
      return {
        ...base,
        actor: null,
        headline: `Your Refund Request for **${c.title}** was declined`,
        detail:
          "“You've completed most of the course, which is past our refund limits.”",
        meta: "You can raise a new Refund Request from the course page.",
        href: `/courses/${c.slug}`,
        cta: "View course",
      };
    case "refund-requested":
      return {
        ...base,
        actor: who,
        headline: `**${who}** asked for a Refund on **${c.title}**`,
        detail: "“The course wasn't what I expected from the description.”",
        href: `/admin/refunds`,
        cta: "Review Refund Request",
      };
    case "question-asked":
      return {
        ...base,
        actor: who,
        headline: `**${who}** asked a Question on **${ctx.lesson.title}**`,
        detail: "“Why do we reset the state here instead of deriving it?”",
        meta: ctx.course.title,
        href: lessonHref,
        cta: "Answer Question",
      };
    case "question-replied":
      return {
        ...base,
        actor: who,
        headline: `**${who}** replied to your Question on **${ctx.lesson.title}**`,
        detail: "“Good catch — deriving it is cleaner, see the next lesson.”",
        meta: ctx.course.title,
        href: lessonHref,
        cta: "Read reply",
      };
    case "seat-claimed":
      return {
        ...base,
        actor: who,
        headline: `**${who}** claimed a Seat on **${c.title}**`,
        meta: `${3 + (i % 3)} of 10 Seats claimed`,
        href: `/team`,
        cta: "View team",
      };
  }
}

/** The kinds this person can receive, by role (from the agreed list). */
export function kindsFor(role: UserRole, isTeamAdmin: boolean): ProtoKind[] {
  const k: ProtoKind[] = [];
  if (role === UserRole.Admin) k.push("refund-requested");
  if (role === UserRole.Instructor) k.push("question-asked");
  if (role === UserRole.Student)
    k.push("refund-approved", "refund-declined", "question-replied");
  if (isTeamAdmin) k.push("seat-claimed", "refund-approved");
  return k.length ? k : ["question-replied"];
}


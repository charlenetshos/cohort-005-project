// ─── PROTOTYPE — throwaway, lives only on the prototype/knock-trigger branch ───
// Answers "Does Knock work for Cadence?" (issue #24): can a real Cadence action
// trigger a Knock workflow that reaches every Admin? Not production code: no
// tests, no stand-in, no retry. Logs everything so the run is visible.

import { Knock } from "@knocklabs/node";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { users, UserRole } from "~/db/schema";

export const NEW_REFUND_REQUEST_WORKFLOW = "new-refund-request";

function knockClient() {
  const apiKey = process.env.KNOCK_SECRET_API_KEY;
  if (!apiKey) throw new Error("[knock.prototype] KNOCK_SECRET_API_KEY is not set");
  return new Knock({ apiKey });
}

export async function notifyAdminsOfNewRefundRequest(input: {
  refundId: number;
  student: { id: number; name: string; email: string };
  courseTitle: string;
  courseSlug: string;
  reason: string;
}) {
  const admins = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .all()
    // Never self-notify (issue #15).
    .filter((admin) => admin.id !== input.student.id);

  console.log(
    "[knock.prototype] triggering",
    NEW_REFUND_REQUEST_WORKFLOW,
    "for admins",
    admins.map((a) => a.id)
  );

  if (admins.length === 0) return;

  try {
    const response = await knockClient().workflows.trigger(
      NEW_REFUND_REQUEST_WORKFLOW,
      {
        // Inline identify: Admins become Knock users on the fly.
        recipients: admins.map((admin) => ({
          id: String(admin.id),
          name: admin.name,
          email: admin.email,
        })),
        actor: {
          id: String(input.student.id),
          name: input.student.name,
          email: input.student.email,
        },
        data: {
          refund_id: input.refundId,
          student_name: input.student.name,
          course_title: input.courseTitle,
          reason: input.reason,
          url: "/admin/refunds",
        },
      }
    );
    console.log("[knock.prototype] trigger ok", response);
  } catch (error) {
    // Spike: the Refund Request is already saved, so log and carry on.
    console.error("[knock.prototype] trigger failed", error);
  }
}

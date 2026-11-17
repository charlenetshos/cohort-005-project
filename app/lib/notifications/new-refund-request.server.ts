import { eq } from "drizzle-orm";
import { db as appDb } from "~/db";
import { courses, users, UserRole } from "~/db/schema";
import { sendNotification, type NotifyOptions } from "./send.server";

const person = { id: users.id, name: users.name, email: users.email };

/** A Student raised a Refund Request: tell every Admin. */
export function notifyNewRefundRequest(
  input: { studentId: number; courseId: number; reason: string },
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("new-refund-request", store, () => {
    const student = db.select(person).from(users).where(eq(users.id, input.studentId)).get();
    const course = db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .get();
    if (!student) throw new Error(`Student ${input.studentId} not found`);
    if (!course) throw new Error(`Course ${input.courseId} not found`);

    return {
      recipients: db.select(person).from(users).where(eq(users.role, UserRole.Admin)).all(),
      actor: student,
      payload: {
        kind: "new-refund-request",
        data: {
          studentName: student.name,
          courseTitle: course.title,
          reason: input.reason,
          url: "/admin/refunds",
        },
      },
    };
  });
}

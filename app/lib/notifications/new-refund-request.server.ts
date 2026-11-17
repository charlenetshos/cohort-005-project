import { eq } from "drizzle-orm";
import { db as appDb } from "~/db";
import { courses, users, UserRole } from "~/db/schema";
import { getPerson, personColumns } from "./person.server";
import { sendNotification, type NotifyOptions } from "./send.server";

/** A Student raised a Refund Request: tell every Admin. */
export function notifyNewRefundRequest(
  input: { studentId: number; courseId: number; reason: string },
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("new-refund-request", store, () => {
    const student = getPerson(db, input.studentId);
    const course = db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, input.courseId))
      .get();
    if (!course) throw new Error(`Course ${input.courseId} not found`);

    return {
      recipients: db.select(personColumns).from(users).where(eq(users.role, UserRole.Admin)).all(),
      actor: student,
      data: {
        studentName: student.name,
        courseTitle: course.title,
        reason: input.reason,
        url: "/admin/refunds",
      },
    };
  });
}

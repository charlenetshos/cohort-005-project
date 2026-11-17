import { db as appDb } from "~/db";
import { getLessonComment, getPerson } from "./lesson-comment.server";
import { sendNotification, type NotifyOptions } from "./send.server";

/** A Student asked a Question on a lesson: tell the course's Instructor. */
export function notifyNewQuestion(
  input: { commentId: number },
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("new-question", store, () => {
    const question = getLessonComment(db, input.commentId);

    return {
      recipients: [getPerson(db, question.instructorId)],
      actor: question.author,
      payload: {
        kind: "new-question",
        data: {
          studentName: question.author.name,
          lessonTitle: question.lessonTitle,
          courseTitle: question.courseTitle,
          questionText: question.body,
          url: question.url,
        },
      },
    };
  });
}

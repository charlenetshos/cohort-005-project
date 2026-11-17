import { db as appDb } from "~/db";
import { getLessonComment } from "./lesson-comment.server";
import { sendNotification, type NotifyOptions } from "./send.server";

/** Someone replied to a Question: tell the Question's author. */
export function notifyQuestionReply(
  input: { commentId: number },
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("question-reply", store, () => {
    const reply = getLessonComment(db, input.commentId);
    if (reply.parentId === null) {
      throw new Error(`Comment ${input.commentId} is not a reply`);
    }
    const question = getLessonComment(db, reply.parentId);

    return {
      recipients: [question.author],
      actor: reply.author,
      payload: {
        kind: "question-reply",
        data: {
          replierName: reply.author.name,
          lessonTitle: reply.lessonTitle,
          courseTitle: reply.courseTitle,
          replyText: reply.body,
          url: reply.url,
        },
      },
    };
  });
}

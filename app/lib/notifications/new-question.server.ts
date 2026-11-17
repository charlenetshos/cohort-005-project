import { db as appDb } from "~/db";
import { UserRole } from "~/db/schema";
import { getLessonComment } from "./lesson-comment.server";
import { getPerson } from "./person.server";
import { sendNotification, type NotifyOptions } from "./send.server";

/** A Student asked a Question on a lesson: tell the course's Instructor. */
export function notifyNewQuestion(
  input: { commentId: number },
  { db = appDb, store }: NotifyOptions = {}
): Promise<void> {
  return sendNotification("new-question", store, () => {
    const question = getLessonComment(db, input.commentId);
    // Only a Student's top-level comment is a Question (GLOSSARY.md).
    const isQuestion = question.parentId === null && question.authorRole === UserRole.Student;

    return {
      recipients: isQuestion ? [getPerson(db, question.instructorId)] : [],
      actor: question.author,
      data: {
        studentName: question.author.name,
        lessonTitle: question.lessonTitle,
        courseTitle: question.courseTitle,
        questionText: question.body,
        url: question.url,
      },
    };
  });
}

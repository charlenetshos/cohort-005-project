import { z } from "zod";

export const MAX_NOTE_LENGTH = 2000;

// A Note body is plain text: trimmed, capped, and never rendered as Markdown.
// An over-long Note is refused, not truncated.
export const noteBodySchema = z
  .string()
  .trim()
  .max(
    MAX_NOTE_LENGTH,
    `A note must be ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters or fewer.`
  );

// The limits a learner is held to when asking for a Refund. The Admin screen
// warns when a learner has gone past one, but never blocks the decision.
// Shared with the browser, so this module must stay free of server code.
export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundWarning =
  | "outside-window"
  | "watched-too-much"
  | "completed-too-much";

export function sayDuration(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

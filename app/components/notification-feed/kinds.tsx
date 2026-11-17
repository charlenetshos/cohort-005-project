import type { ReactNode } from "react";
import { ReceiptText, type LucideIcon } from "lucide-react";
import { CircleDollarSign, XCircle } from "lucide-react";
import { formatPrice } from "~/lib/utils";
import type {
  FeedNotification,
  NotificationKind,
  PayloadOf,
} from "~/lib/notifications/payload";

// ─── How each kind of Notification looks in the Feed ───
// Every Notification is rendered from its payload with Cadence's own wording
// (accepted from the Feed prototype). Knock's templates are not used for
// display. Add one entry per kind; the type makes a missing one an error.

export type NotificationView = {
  /** One line, the key names in bold. */
  headline: ReactNode;
  /** The same line as plain text, for the toast. */
  summary: string;
  /** Text quoted from the thing, shown in quotes and italics. */
  quote?: string;
  /** A small secondary line. */
  meta?: string;
};

type KindEntry<K extends NotificationKind> = {
  icon: LucideIcon;
  view(data: PayloadOf<K>["data"]): NotificationView;
};

const KINDS: { [K in NotificationKind]: KindEntry<K> } = {
  // ── new-refund-request ──
  "new-refund-request": {
    icon: ReceiptText,
    view: ({ studentName, courseTitle, reason }) => ({
      headline: (
        <>
          <strong>{studentName}</strong> asked for a Refund on{" "}
          <strong>{courseTitle}</strong>
        </>
      ),
      summary: `${studentName} asked for a Refund on ${courseTitle}`,
      quote: reason,
    }),
  },
  // ── refund-request-approved ──
  "refund-request-approved": {
    icon: CircleDollarSign,
    view: ({ courseTitle, amount, isTeamLicence }) => {
      const detail = `${formatPrice(amount)} is on its way back to you.${
        isTeamLicence ? " Its Seat Codes no longer work." : ""
      }`;
      return {
        headline: (
          <>
            Your Refund Request for <strong>{courseTitle}</strong> was approved:{" "}
            {detail}
          </>
        ),
        summary: `Your Refund Request for ${courseTitle} was approved: ${detail}`,
      };
    },
  },
  // ── refund-request-declined ──
  "refund-request-declined": {
    icon: XCircle,
    view: ({ courseTitle, note }) => ({
      headline: (
        <>
          Your Refund Request for <strong>{courseTitle}</strong> was declined
        </>
      ),
      summary: `Your Refund Request for ${courseTitle} was declined`,
      quote: note,
      meta: "You can raise a new Refund Request from the course page.",
    }),
  },
  // ── more kinds go here, one entry each ──
};

export function iconFor(notification: FeedNotification): LucideIcon {
  return KINDS[notification.kind].icon;
}

export function viewOf(notification: FeedNotification): NotificationView {
  // TypeScript cannot pair a kind's entry with that kind's data through the
  // union, so name the pairing once here.
  const entry = KINDS[notification.kind] as KindEntry<typeof notification.kind>;
  return entry.view(notification.data);
}

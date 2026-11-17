import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { Bell, BellRing, Check, CheckCheck, CircleDot, Inbox, X } from "lucide-react";
import { cn } from "~/lib/utils";
import type { FeedNotification } from "~/lib/notifications/payload";
import { iconFor, viewOf } from "./kinds";
import { useNotificationFeed, type NotificationFeed } from "./use-notification-feed";

// ─── The Notification Feed ───
// A bell in the sidebar header with the unread count opens a right-hand
// drawer (the design on the `prototype/notification-feed` branch: variant A's
// bell, variant B's drawer). New arrivals raise the badge and show a toast.

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const feed = useNotificationFeed({
    onArrival: useCallback((notification: FeedNotification) => {
      toast(viewOf(notification).summary, {
        icon: <Bell className="size-4" />,
        action: { label: "View", onClick: () => setOpen(true) },
      });
    }, []),
  });
  const pulse = usePulseOnIncrease(feed.unreadCount);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={`Notifications (${feed.unreadCount} unread)`}
        >
          {pulse ? <BellRing className="size-5 animate-bounce" /> : <Bell className="size-5" />}
          <UnreadBadge count={feed.unreadCount} className="absolute -right-1.5 -top-1.5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l bg-background shadow-2xl"
        >
          <Drawer feed={feed} onClose={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Drawer({ feed, onClose }: { feed: NotificationFeed; onClose: () => void }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const shown = feed.items.filter((n) => filter === "all" || !n.readAt);
  const today = shown.filter((n) => isToday(n.insertedAt));
  const earlier = shown.filter((n) => !isToday(n.insertedAt));

  function open(notification: FeedNotification) {
    feed.markRead(notification.id);
    onClose();
    navigate(notification.data.url);
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-5 py-4">
        <Dialog.Title className="text-base font-semibold">Notifications</Dialog.Title>
        <UnreadBadge count={feed.unreadCount} />
        <Dialog.Close className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Dialog.Close>
      </div>
      <div className="flex items-center gap-1 border-b px-5 py-2">
        {(["all", "unread"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setFilter(option)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize",
              filter === option ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {option}
          </button>
        ))}
        {feed.unreadCount > 0 && (
          <button
            onClick={feed.markAllRead}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckCheck className="size-3.5" /> Mark all as read
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {shown.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Group label="Today" items={today} feed={feed} onOpen={open} />
            <Group label="Earlier" items={earlier} feed={feed} onOpen={open} className="pt-4" />
          </>
        )}
      </div>
    </>
  );
}

function Group({
  label,
  items,
  feed,
  onOpen,
  className,
}: {
  label: string;
  items: FeedNotification[];
  feed: NotificationFeed;
  onOpen: (notification: FeedNotification) => void;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <div
        className={cn(
          "px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70",
          className
        )}
      >
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((notification) => (
          <Row key={notification.id} notification={notification} feed={feed} onOpen={onOpen} />
        ))}
      </ul>
    </>
  );
}

function Row({
  notification,
  feed,
  onOpen,
}: {
  notification: FeedNotification;
  feed: NotificationFeed;
  onOpen: (notification: FeedNotification) => void;
}) {
  const Icon = iconFor(notification);
  const view = viewOf(notification);
  const isRead = notification.readAt !== null;

  return (
    <li
      className={cn(
        "group relative flex gap-3 rounded-lg border p-3",
        isRead ? "border-transparent" : "border-primary/30 bg-primary/5"
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(notification)}>
        <span className="block text-sm text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          {view.headline}
        </span>
        {view.quote && (
          <span className="mt-1 block text-sm italic text-muted-foreground">
            “{view.quote}”
          </span>
        )}
        {view.meta && <span className="mt-1 block text-xs text-muted-foreground/80">{view.meta}</span>}
        <span className="mt-1.5 block text-xs text-muted-foreground/70">{timeAgo(notification.insertedAt)}</span>
      </button>
      <button
        onClick={() => (isRead ? feed.markUnread(notification.id) : feed.markRead(notification.id))}
        title={isRead ? "Mark as unread" : "Mark as read"}
        aria-label={isRead ? "Mark as unread" : "Mark as read"}
        className="h-fit rounded p-1 text-muted-foreground opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100"
      >
        {isRead ? <CircleDot className="size-4" /> : <Check className="size-4" />}
      </button>
    </li>
  );
}

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
      <Inbox className="size-10" />
      <div className="text-sm font-medium text-foreground">You're all caught up</div>
      <div className="max-w-60 text-xs">
        We'll let you know here when something needs you: Refund decisions, new Questions, replies and Seat claims.
      </div>
    </div>
  );
}

function usePulseOnIncrease(count: number) {
  const previous = useRef(count);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (count > previous.current) {
      setPulse(true);
      const timer = window.setTimeout(() => setPulse(false), 1200);
      previous.current = count;
      return () => window.clearTimeout(timer);
    }
    previous.current = count;
  }, [count]);
  return pulse;
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

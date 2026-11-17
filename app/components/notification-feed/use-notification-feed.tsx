import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LOCAL_FEED_ROUTE, type FeedConfig } from "~/lib/notifications/feed-config";
import type { FeedNotification } from "~/lib/notifications/payload";

// ─── useNotificationFeed() ───
// One hook for the Feed, whatever delivers the Notifications. The provider
// picks the version from the layout loader's FeedConfig:
//   local — polls the local resource route every 5 seconds
//   knock — Knock's headless hooks (arrives with #26)
// Key the provider by user id so a DevUI user switch remounts it.

export type NotificationFeed = {
  /** Newest first. */
  items: FeedNotification[];
  unreadCount: number;
  markRead(id: string): void;
  markUnread(id: string): void;
  markAllRead(): void;
};

type ArrivalListener = (notification: FeedNotification) => void;

type FeedContextValue = NotificationFeed & {
  subscribeToArrivals(listener: ArrivalListener): () => void;
};

const FeedContext = createContext<FeedContextValue | null>(null);

/**
 * The current user's Notification Feed. `onArrival` is called for each
 * Notification that arrives while the page is open (not for ones already
 * there when it loaded).
 */
export function useNotificationFeed(
  options: { onArrival?: ArrivalListener } = {}
): NotificationFeed {
  const feed = useContext(FeedContext);
  if (!feed) {
    throw new Error("useNotificationFeed() needs a NotificationFeedProvider");
  }

  const onArrival = useRef(options.onArrival);
  onArrival.current = options.onArrival;
  const { subscribeToArrivals } = feed;
  useEffect(
    () => subscribeToArrivals((notification) => onArrival.current?.(notification)),
    [subscribeToArrivals]
  );

  return feed;
}

export function NotificationFeedProvider({
  config,
  children,
}: {
  config: FeedConfig;
  children: ReactNode;
}) {
  if (config.mode === "local") {
    return <LocalFeedProvider>{children}</LocalFeedProvider>;
  }
  // Knock mode arrives with #26.
  return <>{children}</>;
}

// ─── Local version ───

const POLL_INTERVAL_MS = 5000;

function useArrivalListeners() {
  const listeners = useRef(new Set<ArrivalListener>());
  const subscribeToArrivals = useCallback((listener: ArrivalListener) => {
    listeners.current.add(listener);
    return () => void listeners.current.delete(listener);
  }, []);
  const announce = useCallback((notification: FeedNotification) => {
    listeners.current.forEach((listener) => listener(notification));
  }, []);
  return { subscribeToArrivals, announce };
}

function LocalFeedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FeedNotification[]>([]);
  const seenIds = useRef<Set<string> | null>(null);
  const { subscribeToArrivals, announce } = useArrivalListeners();

  const refresh = useCallback(async () => {
    const response = await fetch(LOCAL_FEED_ROUTE, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const { notifications } = (await response.json()) as {
      notifications: FeedNotification[];
    };

    const seen = seenIds.current;
    seenIds.current = new Set(notifications.map((n) => n.id));
    if (seen) {
      notifications
        .filter((n) => !seen.has(n.id) && !n.readAt)
        .forEach(announce);
    }
    setItems(notifications);
  }, [announce]);

  useEffect(() => {
    const poll = () => void refresh().catch(() => {});
    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const post = useCallback(
    (fields: Record<string, string>, optimistic: (items: FeedNotification[]) => FeedNotification[]) => {
      setItems(optimistic);
      void fetch(LOCAL_FEED_ROUTE, { method: "POST", body: new URLSearchParams(fields) })
        .then(refresh)
        .catch(() => {});
    },
    [refresh]
  );

  const value = useMemo<FeedContextValue>(() => {
    const now = () => new Date().toISOString();
    return {
      items,
      unreadCount: items.filter((n) => !n.readAt).length,
      markRead: (id) =>
        post({ intent: "markRead", id }, (current) =>
          current.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now() } : n))
        ),
      markUnread: (id) =>
        post({ intent: "markUnread", id }, (current) =>
          current.map((n) => (n.id === id ? { ...n, readAt: null } : n))
        ),
      markAllRead: () =>
        post({ intent: "markAllRead" }, (current) =>
          current.map((n) => (n.readAt ? n : { ...n, readAt: now() }))
        ),
      subscribeToArrivals,
    };
  }, [items, post, subscribeToArrivals]);

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

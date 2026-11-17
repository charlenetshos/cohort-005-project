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
import { z } from "zod";
import { KnockFeedProvider, KnockProvider, useKnockFeed } from "@knocklabs/react-core";
import {
  KNOCK_TOKEN_ROUTE,
  LOCAL_FEED_ROUTE,
  type FeedConfig,
} from "~/lib/notifications/feed-config";
import { fromKnockFeedItem, type KnockFeedItemFields } from "~/lib/notifications/knock-feed";
import {
  markings,
  parseFeedNotifications,
  type FeedNotification,
} from "~/lib/notifications/payload";

// ─── useNotificationFeed() ───
// One hook for the Feed, whatever delivers the Notifications. The provider
// picks the version from the layout loader's FeedConfig:
//   local — polls the local resource route every 5 seconds
//   knock — Knock's headless hooks, real time over Knock's socket
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
  return <KnockFeed config={config}>{children}</KnockFeed>;
}

// ─── Knock version ───
// Knock's headless hooks, authenticated with the token the server signed for
// this user (enhanced security mode). The user is already known to Knock from
// the trigger call, so the browser makes no identify call. Before the token
// expires, the refresh route signs a fresh one for the session's user.

type KnockFeedConfig = Extract<FeedConfig, { mode: "knock" }>;

const tokenResponse = z.object({ token: z.string() });

async function fetchFreshToken(): Promise<string | undefined> {
  const response = await fetch(KNOCK_TOKEN_ROUTE, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return undefined;
  const parsed = tokenResponse.safeParse(await response.json());
  return parsed.success ? parsed.data.token : undefined;
}

function KnockFeed({ config, children }: { config: KnockFeedConfig; children: ReactNode }) {
  return (
    <KnockProvider
      apiKey={config.publicKey}
      user={{ id: config.userId }}
      identificationStrategy="skip"
      userToken={config.token}
      onUserTokenExpiring={fetchFreshToken}
    >
      <KnockFeedProvider feedId={config.channelId}>
        <KnockFeedBridge>{children}</KnockFeedBridge>
      </KnockFeedProvider>
    </KnockProvider>
  );
}

function toNotifications(items: KnockFeedItemFields[]): FeedNotification[] {
  return items.flatMap((item) => fromKnockFeedItem(item) ?? []);
}

function KnockFeedBridge({ children }: { children: ReactNode }) {
  const { feedClient, useFeedStore } = useKnockFeed();
  const knockItems = useFeedStore((state) => state.items);
  const unreadCount = useFeedStore((state) => state.metadata.unread_count);
  const { subscribeToArrivals, announce } = useArrivalListeners();

  useEffect(() => {
    void feedClient.fetch();
  }, [feedClient]);

  useEffect(() => {
    const onRealtime = ({ items }: { items: KnockFeedItemFields[] }) =>
      toNotifications(items)
        .filter((n) => !n.readAt)
        .forEach(announce);
    feedClient.on("items.received.realtime", onRealtime);
    return () => feedClient.off("items.received.realtime", onRealtime);
  }, [feedClient, announce]);

  const value = useMemo<FeedContextValue>(() => {
    const withId = (id: string) => knockItems.filter((item) => item.id === id);
    return {
      items: toNotifications(knockItems),
      unreadCount,
      markRead: (id) => void feedClient.markAsRead(withId(id)),
      markUnread: (id) => void feedClient.markAsUnread(withId(id)),
      markAllRead: () => void feedClient.markAllAsRead(),
      subscribeToArrivals,
    };
  }, [knockItems, unreadCount, feedClient, subscribeToArrivals]);

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

// ─── Local version ───

const POLL_INTERVAL_MS = 5000;

/** The local Feed route's response, dropping any item that is not a Notification. */
const localFeedResponse = z.object({
  notifications: z.array(z.unknown()).transform(parseFeedNotifications),
});

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
    const { notifications } = localFeedResponse.parse(await response.json());

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
          current.map(markings.read([id], now()))
        ),
      markUnread: (id) =>
        post({ intent: "markUnread", id }, (current) => current.map(markings.unread([id]))),
      markAllRead: () =>
        post({ intent: "markAllRead" }, (current) => current.map(markings.read("all", now()))),
      subscribeToArrivals,
    };
  }, [items, post, subscribeToArrivals]);

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

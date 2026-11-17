// PROTOTYPE — throwaway. Three Notification Feed variants, switched by
// `?variant=A|B|C` on any page inside the app layout.
// Wayfinder ticket: "What does the Notification Feed look like?"
//   A — Bell + popover in the sidebar header
//   B — "Notifications" nav item opening a right-hand drawer
//   C — "Notifications" nav item opening a full inbox page (/notifications)
// State is in-memory only (resets on reload). Nothing here talks to a provider:
// the design must work with Knock's headless hooks or a Cadence-owned feed.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { Dialog, Popover } from "radix-ui";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Inbox,
  MessageSquare,
  Plus,
  ReceiptText,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  makeNotification,
  type Ctx,
  type ProtoKind,
  type ProtoNotification,
} from "~/lib/notification-feed.prototype";

// ─── In-memory store ───

type State = { items: ProtoNotification[]; ownerId: number | null };
let state: State = { items: [], ownerId: null };
let ctx: Ctx | null = null;
let kinds: ProtoKind[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (items: ProtoNotification[]) => {
  state = { ...state, items };
  emit();
};

export const feed = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  seed(ownerId: number, items: ProtoNotification[], c: Ctx | null, k: ProtoKind[]) {
    if (state.ownerId === ownerId) return;
    ctx = c;
    kinds = k;
    state = { ownerId, items };
    emit();
  },
  markRead: (id: string) =>
    set(state.items.map((n) => (n.id === id ? { ...n, read: true } : n))),
  toggleRead: (id: string) =>
    set(state.items.map((n) => (n.id === id ? { ...n, read: !n.read } : n))),
  markAllRead: () => set(state.items.map((n) => ({ ...n, read: true }))),
  clear: () => set([]),
  simulate(): ProtoNotification | null {
    if (!ctx || kinds.length === 0) return null;
    const i = Math.floor(Math.random() * 100);
    const n = makeNotification(kinds[i % kinds.length], ctx, i, 0, false);
    set([n, ...state.items]);
    return n;
  },
};

function useFeed() {
  const s = useSyncExternalStore(feed.subscribe, feed.get, feed.get);
  return { items: s.items, unread: s.items.filter((n) => !n.read).length };
}

// ─── Shared bits (presentation only; each variant owns its layout) ───

const KIND_ICON: Record<ProtoKind, typeof Bell> = {
  "refund-approved": CircleDollarSign,
  "refund-declined": XCircle,
  "refund-requested": ReceiptText,
  "question-asked": MessageSquare,
  "question-replied": MessageSquare,
  "seat-claimed": UserPlus,
};

function Headline({ text, className }: { text: string; className?: string }) {
  const parts = text.split("**");
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-foreground">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

function ago(m: number) {
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function Badge({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground",
        className
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center text-center text-muted-foreground", compact ? "gap-2 py-10" : "gap-3 py-24")}>
      <Inbox className={compact ? "size-6" : "size-10"} />
      <div className="text-sm font-medium text-foreground">You're all caught up</div>
      <div className="max-w-60 text-xs">
        We'll let you know here when something needs you: Refund decisions, new Questions, replies and Seat claims.
      </div>
    </div>
  );
}

// ─── Variant A: bell + popover ───
// Compact. Bell lives in the sidebar header; list opens beside it.
// Clicking a row marks it read and goes to the thing.

export function VariantABell() {
  const { items, unread } = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const prev = useRef(unread);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (unread > prev.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
    }
    prev.current = unread;
  }, [unread]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={`Notifications (${unread} unread)`}
        >
          {pulse ? <BellRing className="size-5 animate-bounce" /> : <Bell className="size-5" />}
          <Badge n={unread} className="absolute -right-1.5 -top-1.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">Notifications</div>
            {unread > 0 && (
              <button onClick={feed.markAllRead} className="text-xs text-muted-foreground hover:text-foreground">
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <EmptyState compact />
          ) : (
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      feed.markRead(n.id);
                      setOpen(false);
                      navigate(n.href);
                    }}
                    className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/60", !n.read && "bg-primary/5")}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                    <span className="min-w-0 flex-1">
                      <Headline text={n.headline} className="block text-sm text-muted-foreground" />
                      <span className="mt-1 block text-xs text-muted-foreground/70">{ago(n.minutesAgo)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ─── Variant B: nav item + right-hand drawer ───
// Roomier rows with the quote/detail, kind icons, Unread/All filter,
// grouped by Today / Earlier, per-row read toggle. Live arrivals show a toast.

function useArrivalToast(onView: () => void) {
  const { items } = useFeed();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(items.map((n) => n.id));
      return;
    }
    for (const n of items) {
      if (!seen.current.has(n.id)) {
        seen.current.add(n.id);
        if (n.minutesAgo === 0)
          toast(n.headline.replaceAll("**", ""), {
            icon: <Bell className="size-4" />,
            action: { label: "View", onClick: onView },
          });
      }
    }
  }, [items, onView]);
}

export function VariantBNavItem() {
  const { items, unread } = useFeed();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"unread" | "all">("all");
  useArrivalToast(() => setOpen(true));
  const shown = items.filter((n) => filter === "all" || !n.read);
  const today = shown.filter((n) => n.minutesAgo < 1440);
  const earlier = shown.filter((n) => n.minutesAgo >= 1440);

  const Row = ({ n }: { n: ProtoNotification }) => {
    const Icon = KIND_ICON[n.kind];
    return (
      <li className={cn("group relative flex gap-3 rounded-lg border p-3", !n.read ? "border-primary/30 bg-primary/5" : "border-transparent")}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            feed.markRead(n.id);
            setOpen(false);
            navigate(n.href);
          }}
        >
          <Headline text={n.headline} className="block text-sm text-muted-foreground" />
          {n.detail && <span className="mt-1 block text-sm italic text-muted-foreground">{n.detail}</span>}
          {n.meta && <span className="mt-1 block text-xs text-muted-foreground/80">{n.meta}</span>}
          <span className="mt-1.5 block text-xs text-muted-foreground/70">{ago(n.minutesAgo)}</span>
        </button>
        <button
          onClick={() => feed.toggleRead(n.id)}
          title={n.read ? "Mark as unread" : "Mark as read"}
          className="h-fit rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
        >
          <Check className="size-4" />
        </button>
      </li>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <Bell className="size-4" />
          Notifications
          <Badge n={unread} className="ml-auto" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l bg-background shadow-2xl">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <Dialog.Title className="text-base font-semibold">Notifications</Dialog.Title>
            <Badge n={unread} />
            <Dialog.Close className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="flex items-center gap-1 border-b px-5 py-2">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize", filter === f ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
              >
                {f}
              </button>
            ))}
            {unread > 0 && (
              <button onClick={feed.markAllRead} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <CheckCheck className="size-3.5" /> Mark all as read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {shown.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {today.length > 0 && (
                  <>
                    <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Today</div>
                    <ul className="space-y-1">{today.map((n) => <Row key={n.id} n={n} />)}</ul>
                  </>
                )}
                {earlier.length > 0 && (
                  <>
                    <div className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Earlier</div>
                    <ul className="space-y-1">{earlier.map((n) => <Row key={n.id} n={n} />)}</ul>
                  </>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Variant C: nav item + full inbox page ───
// The sidebar item is a link to /notifications (a two-pane inbox page).
// Arrivals elsewhere show a toast; the page itself lists and previews.

export function VariantCNavLink() {
  const { unread } = useFeed();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  useArrivalToast(() => navigate(`/notifications?${sp.toString()}`));
  return (
    <NavLink
      to={`/notifications?${sp.toString()}`}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      <Badge n={unread} className="ml-auto" />
    </NavLink>
  );
}

export function VariantCInboxPage() {
  const { items, unread } = useFeed();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((n) => n.id === selectedId) ?? null;
  useEffect(() => {
    if (selected && !selected.read) feed.markRead(selected.id);
  }, [selected]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <span className="text-sm text-muted-foreground">{unread} unread</span>
        {unread > 0 && (
          <button onClick={feed.markAllRead} className="ml-auto flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <CheckCheck className="size-4" /> Mark all as read
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-[26rem] shrink-0 overflow-y-auto border-r">
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={cn(
                      "flex w-full gap-3 border-b px-5 py-3 text-left",
                      selectedId === n.id ? "bg-muted" : "hover:bg-muted/50",
                      !n.read && "border-l-2 border-l-primary"
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <Headline text={n.headline} className={cn("line-clamp-2 block text-sm", n.read ? "text-muted-foreground" : "text-foreground")} />
                      <span className="mt-1 block text-xs text-muted-foreground/70">{ago(n.minutesAgo)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex-1 overflow-y-auto p-8">
            {selected ? (
              <div className="max-w-xl">
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  {(() => {
                    const Icon = KIND_ICON[selected.kind];
                    return <Icon className="size-4" />;
                  })()}
                  {ago(selected.minutesAgo)}
                </div>
                <Headline text={selected.headline} className="block text-lg text-muted-foreground" />
                {selected.detail && (
                  <blockquote className="mt-4 border-l-2 pl-4 italic text-muted-foreground">{selected.detail}</blockquote>
                )}
                {selected.meta && <p className="mt-3 text-sm text-muted-foreground">{selected.meta}</p>}
                <div className="mt-6 flex gap-2">
                  <Link to={selected.href} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    {selected.cta}
                  </Link>
                  <button onClick={() => feed.toggleRead(selected.id)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
                    Mark as unread
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a Notification to see it here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Floating switcher (prototype chrome, not part of the design) ───

export const VARIANTS = [
  { key: "A", name: "Bell + popover" },
  { key: "B", name: "Nav item + drawer" },
  { key: "C", name: "Nav item + inbox page" },
] as const;

export function useVariant() {
  const [sp] = useSearchParams();
  const v = sp.get("variant") ?? "A";
  return VARIANTS.some((x) => x.key === v) ? v : "A";
}

export function PrototypeSwitcher() {
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const current = useVariant();
  const idx = VARIANTS.findIndex((v) => v.key === current);
  const go = (d: number) => {
    const next = VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key;
    const p = new URLSearchParams(sp);
    p.set("variant", next);
    setSp(p, { replace: true, preventScrollReset: true });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable]") || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (import.meta.env.PROD) return null;
  const v = VARIANTS[idx];
  const onInbox = location.pathname === "/notifications";
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">Prototype</span>
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10" aria-label="Previous variant">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-48 text-center font-medium">
        {v.key} <span className="text-white/60">({v.name})</span>
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10" aria-label="Next variant">
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/20" />
      <button onClick={() => feed.simulate()} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10" title="Simulate a new Notification arriving live">
        <Plus className="size-3.5" /> New
      </button>
      <button onClick={feed.clear} className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10" title="Clear all (see the empty state)">
        <Trash2 className="size-3.5" /> Empty
      </button>
      {onInbox && current !== "C" && <span className="px-2 text-xs text-amber-300">/notifications is C's page</span>}
    </div>
  );
}

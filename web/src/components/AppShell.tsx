"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ic } from "@/components/Icons";
import { useAppData, type AppData } from "@/lib/useAppData";
import { createClient } from "@/lib/supabase/client";
import { Bell } from "@/components/Bell";
import { initials, todayIso } from "@/lib/format";
import type { ChatRef, EventRow, Profile } from "@/lib/types";
import { PublicView, CommunityView, ThreadsView, MineView } from "@/components/views/Lists";
import { CalendarView, TeamsView, UniCalendarView } from "@/components/views/Calendars";
import { Detail } from "@/components/Detail";
import { ChatPanel } from "@/components/Chat";
import { SheetHost, type SheetState } from "@/components/Sheets";

export type Tab = "public" | "community" | "threads" | "calendar" | "mine" | "teams" | "ucal";
type ListKey = "public" | "community" | "threads";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "community", label: "Community", icon: "users" },
  { id: "public", label: "Public", icon: "ticket" },
  { id: "threads", label: "Threads", icon: "chat" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "mine", label: "My events", icon: "star" },
];
const UNI_TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "teams", label: "Teams", icon: "users" },
  { id: "ucal", label: "Calendar", icon: "calendar" },
];

export type UiState = {
  tag: Record<ListKey, string | null>;
  panel: Record<ListKey, "tags" | "dates" | null>;
  q: Record<ListKey, string>;
  range: Record<"public" | "community", { from: string; to: string } | null>;
  threadSeg: "mine" | "explore";
  mineFilter: "joined" | "hosting";
  calDay: string;
  uniDay: string;
};

type Ctx = {
  confirm: (d: { title: string; body: string; ok: string; danger?: boolean }) => Promise<boolean>;
  me: Profile;
  data: AppData;
  ui: UiState;
  setUi: (fn: (u: UiState) => UiState) => void;
  today: string;
  toast: (msg: string) => void;
  openDetail: (id: string) => void;
  openChat: (ref: ChatRef, tab?: string) => void;
  openSheet: (s: SheetState) => void;
  toggleJoin: (e: EventRow) => Promise<void>;
  toggleFollow: (threadId: string) => Promise<void>;
  isGoing: (id: string) => boolean;
  isFull: (e: EventRow) => boolean;
};

const AppCtx = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppShell");
  return c;
}

export function AppShell({ me }: { me: Profile }) {
  const data = useAppData(me);
  const router = useRouter();
  const today = todayIso();
  const [uni, setUni] = useState(false);
  const [tab, setTabState] = useState<Tab>("community");
  const [ui, setUiState] = useState<UiState>({
    tag: { public: null, community: null, threads: null },
    panel: { public: null, community: null, threads: null },
    q: { public: "", community: "", threads: "" },
    range: { public: null, community: null },
    threadSeg: "mine",
    mineFilter: "joined",
    calDay: today,
    uniDay: today,
  });
  const setUi = useCallback((fn: (u: UiState) => UiState) => setUiState(fn), []);
  const [detail, setDetail] = useState<string | null>(null);
  const [chat, setChat] = useState<{ ref: ChatRef; tab: string } | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  // Overlays stack in the order they were opened (chat over detail or back).
  const [layers, setLayers] = useState({ detail: 4, chat: 5 });
  const [toastMsg, setToastMsg] = useState<{ text: string; n: number } | null>(null);
  // "Are you coming?" before joining, "Leave this event?" before leaving.
  const [dialog, setDialog] = useState<{ title: string; body: string; ok: string; danger?: boolean; resolve: (yes: boolean) => void } | null>(null);
  const confirm = useCallback(
    (d: { title: string; body: string; ok: string; danger?: boolean }) => new Promise<boolean>((resolve) => setDialog({ ...d, resolve })),
    [],
  );
  const viewRef = useRef<HTMLElement>(null);

  // The tab lives in the URL hash, as in the mockup, so reloads keep it.
  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (eventId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL once on mount
      setDetail(eventId);
      history.replaceState(null, "", `/${window.location.hash}`);
    }
    const threadId = new URLSearchParams(window.location.search).get("thread");
    if (threadId) {
      setChat({ ref: { type: "thread", id: threadId }, tab: "chat" });
      history.replaceState(null, "", `/${window.location.hash}`);
    }
    // The hash picks the tab; without one (the logo, "Back to the app") the
    // last mode is kept, so University mode survives leaving the screen.
    const start = window.location.hash.slice(1) as Tab;
    let savedUni = false;
    try {
      savedUni = localStorage.getItem("sq-uni") === "1";
    } catch {}
    if ([...TABS, ...UNI_TABS].some((t) => t.id === start)) {
      setTabState(start);
      setUni(UNI_TABS.some((t) => t.id === start));
    } else if (savedUni) {
      setTabState("teams");
      setUni(true);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sq-uni", uni ? "1" : "0");
    } catch {}
  }, [uni]);

  const setTab = useCallback((id: Tab) => {
    setTabState(id);
    viewRef.current?.scrollTo(0, 0);
    try {
      history.replaceState(null, "", `#${id}`);
    } catch {}
  }, []);

  const toast = useCallback((text: string) => setToastMsg((t) => ({ text, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toastMsg) return;
    const id = setTimeout(() => setToastMsg(null), 1900);
    return () => clearTimeout(id);
  }, [toastMsg]);

  const raise = (which: "detail" | "chat") =>
    setLayers((l) => ({ ...l, [which]: Math.max(l.detail, l.chat) + 1 }));
  const openDetail = useCallback((id: string) => {
    setDetail(id);
    raise("detail");
  }, []);
  const openChat = useCallback(
    (ref: ChatRef, chatTab = "chat") => {
      setChat({ ref, tab: chatTab });
      raise("chat");
      void data.supabase.rpc("mark_read", { p_chat_key: `${ref.type}:${ref.id}` }).then(() => data.loadChats());
    },
    [data],
  );

  const isGoing = useCallback((id: string) => data.going.get(id)?.status === "going" || data.events.find((e) => e.id === id)?.host_id === me.id, [data.going, data.events, me.id]);
  const isFull = useCallback(
    (e: EventRow) => e.kind === "community" && !isGoing(e.id) && e.max_going !== null && e.going_count + 1 >= e.max_going,
    [isGoing],
  );

  const toggleJoin = useCallback(
    async (e: EventRow) => {
      const mine = data.going.get(e.id);
      if (e.host_id === me.id) return toast("You’re hosting this event");
      const series = e.repeat !== "none" ? " (It repeats: this is for every date.)" : "";
      // Like Sidequest: a little nudge to only join when you'll really come.
      const yes = await confirm(
        mine
          ? mine.status === "requested"
            ? { title: "Cancel your request?", body: `The host of “${e.title}” won’t see it any more.`, ok: "Cancel request", danger: true }
            : mine.status === "waitlist"
            ? { title: "Leave the waitlist?", body: `You’ll lose your place in line for “${e.title}”.`, ok: "Leave waitlist", danger: true }
            : {
                title: "Leave this event?",
                body: `You’ll leave the group chat, and your spot goes to the next person on the waitlist.${series} We’ll miss you 👋`,
                ok: "Leave event",
                danger: true,
              }
          : e.join_mode === "approval"
            ? {
                title: "Ask to join?",
                body: `The host picks who comes to “${e.title}”. If they say yes, you’re in and get the group chat. Only ask if you’re planning to show up 🙏${series}`,
                ok: "Send request",
              }
          : isFull(e)
            ? {
                title: "Join the waitlist?",
                body: `“${e.title}” is full right now. If a spot opens up it’s yours, so only sign up if you’d really come 🙌`,
                ok: "Put me on the waitlist",
              }
            : {
                title: "Are you coming?",
                body: `The group plans around who’s coming, and empty spots make everyone a little sad 😢 Please only join if you’re planning to show up. If plans change, leave so someone else can take your place.${series}`,
                ok: "I’ll be there",
              },
      );
      if (!yes) return;
      if (mine) {
        const { error } = await data.supabase.from("going").delete().eq("event_id", e.id).eq("user_id", me.id);
        if (error) return toast(`Couldn’t leave: ${error.message}`);
        toast(mine.status === "requested" ? "Request cancelled" : mine.status === "waitlist" ? "You left the waitlist" : "You left this event");
      } else {
        const { data: row, error } = await data.supabase.from("going").insert({ event_id: e.id }).select("status").single();
        if (error) return toast(`Couldn’t join: ${error.message}`);
        toast(
          row.status === "requested"
            ? "Request sent · the host will answer"
            : row.status === "waitlist"
              ? "Added to the waitlist"
              : "You’re going · group chat is in My events",
        );
      }
      await Promise.all([data.loadGoing(), data.loadEvents(), data.loadChats()]);
    },
    [data, me.id, toast, confirm, isFull],
  );

  const toggleFollow = useCallback(
    async (threadId: string) => {
      const t = data.threads.find((x) => x.id === threadId);
      if (!t) return;
      const { error } = t.followed
        ? await data.supabase.from("follows").delete().eq("thread_id", threadId).eq("user_id", me.id)
        : await data.supabase.from("follows").insert({ thread_id: threadId });
      if (error) return toast(`Couldn’t update: ${error.message}`);
      toast(t.followed ? `Unfollowed ${t.name}` : "Added to My threads");
      await Promise.all([data.loadThreads(), data.loadChats()]);
    },
    [data, me.id, toast],
  );

  const setMode = (next: boolean) => {
    setUni(next);
    setChat(null);
    setDetail(null);
    setSheet(null);
    setFabMenu(false);
    setTab(next ? "teams" : "community");
    toast(next ? "University mode" : "City mode");
  };

  const ctx: Ctx = {
    confirm,
    me,
    data,
    ui,
    setUi,
    today,
    toast,
    openDetail,
    openChat,
    openSheet: setSheet,
    toggleJoin,
    toggleFollow,
    isGoing,
    isFull,
  };

  const badge = useMemo(() => {
    const sum = (kind: string, filter?: (id: string) => boolean) =>
      [...data.chats.values()].filter((c) => c.kind === kind && (!filter || filter(c.id))).reduce((a, c) => a + c.unread, 0);
    return {
      threads: sum("thread"),
      mine: sum("event") + [...data.requests.values()].reduce((a, n) => a + n, 0),
      teams: sum("team"),
    } as Partial<Record<Tab, number>>;
  }, [data.chats, data.requests]);

  const isVenue = me.role === "venue" || me.role === "admin";
  // In the city the + opens a small menu; the editors are separate pages, so
  // the + spins until the chosen one opens.
  const [fabMenu, setFabMenu] = useState(false);
  const [fabBusy, setFabBusy] = useState(false);
  // Pages (href) or sheets in this screen (sheet).
  const fabItems: { key: string; label: string; icon: string; href?: string; sheet?: SheetState }[] = uni
    ? [
        { key: "team", label: "Add team", icon: "users", sheet: { kind: "team" } },
        { key: "cal", label: "Add to calendar", icon: "calendar", sheet: { kind: "cal", type: "exam" } },
      ]
    : [
        { key: "community", label: "Add community event", icon: "users", href: "/new-event?kind=community" },
        { key: "thread", label: "Add thread", icon: "chat", href: "/new-thread" },
        ...(isVenue ? [{ key: "public", label: "Add public event", icon: "ticket", href: "/new-event?kind=public" }] : []),
      ];
  const onFab = () => {
    if (fabBusy) return;
    setFabMenu((m) => !m);
  };
  const go = (item: (typeof fabItems)[number]) => {
    setFabMenu(false);
    if (item.sheet) return setSheet(item.sheet);
    setFabBusy(true);
    router.push(item.href!);
  };

  const views: Record<Tab, React.ReactNode> = {
    public: <PublicView />,
    community: <CommunityView />,
    threads: <ThreadsView />,
    calendar: <CalendarView />,
    mine: <MineView />,
    teams: <TeamsView />,
    ucal: <UniCalendarView />,
  };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="screen" id="screen">
        <header className="topbar">
          <button
            className="logo"
            aria-label="SideQuest home"
            onClick={() => {
              // Home: the first tab of the current mode, overlays closed.
              setChat(null);
              setDetail(null);
              setSheet(null);
              setFabMenu(false);
              setTab(uni ? "teams" : "community");
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small inline brand mark */}
            <img src="/icons/sidequest-icon.svg" alt="" />
            <span>Side<span className="brand">Quest</span></span>
          </button>
          <span className="spacer" />
          <button className="mode" aria-pressed={uni} onClick={() => setMode(!uni)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 9 12 4 2 9l10 5 10-5z" />
              <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6" />
            </svg>
            University
          </button>
          <ThemeButton />
          <Bell userId={me.id} onOpenEvent={(id) => openDetail(id)} />
          <ProfileMenu me={me} />
        </header>

        <main className="view" id="view" ref={viewRef}>
          {!data.loaded ? <div className="empty">Loading…</div> : views[tab]}
          {data.error && <div className="empty">Something went wrong: {data.error}</div>}
        </main>

        {fabMenu && <div className="fab-scrim" onClick={() => setFabMenu(false)} />}
        <div className={`fab-menu${fabMenu ? " open" : ""}`} aria-hidden={!fabMenu}>
          {fabItems.map((item, i) => (
            <button key={item.key} tabIndex={fabMenu ? 0 : -1} style={{ transitionDelay: fabMenu ? `${40 + i * 40}ms` : "0ms" }} onClick={() => go(item)}>
              <span className="fab-menu-ic">
                <Ic name={item.icon} size={17} />
              </span>
              {item.label}
            </button>
          ))}
        </div>
        <button
          className={`fab${fabBusy ? " busy" : ""}${fabMenu ? " open" : ""}`}
          aria-label="Create"
          aria-expanded={fabMenu}
          aria-busy={fabBusy}
          onClick={onFab}
        >
          {fabBusy ? <span className="spinner fab-spinner" aria-hidden /> : <Ic name="plus" size={24} width={2.6} />}
        </button>

        <nav className="nav" id="nav">
          {(uni ? UNI_TABS : TABS).map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} aria-label={t.label} onClick={() => setTab(t.id)}>
              <Ic name={t.icon} size={22} width={1.9} />
              {t.label}
              {badge[t.id] ? <span className="nbadge">{badge[t.id]}</span> : null}
            </button>
          ))}
        </nav>

        {/* Desktop: the panel sits beside the list; a click outside closes it. */}
        {detail && <div className="detail-scrim" style={{ zIndex: layers.detail - 1 }} onClick={() => setDetail(null)} />}
        <section className={`detail${detail ? " open" : ""}`} aria-hidden={!detail} style={{ zIndex: layers.detail }}>
          {detail && <Detail id={detail} onClose={() => setDetail(null)} />}
        </section>
        <section className={`chat${chat ? " open" : ""}`} aria-hidden={!chat} style={{ zIndex: layers.chat }}>
          {chat && (
            <ChatPanel
              key={`${chat.ref.type}:${chat.ref.id}`}
              chatRef={chat.ref}
              initialTab={chat.tab}
              onClose={() => {
                setChat(null);
                void data.loadChats();
              }}
            />
          )}
        </section>
        <div id="sheet">{sheet && <SheetHost sheet={sheet} onClose={() => setSheet(null)} />}</div>
        {dialog && (
          <div
            className="dialog-wrap"
            onClick={(ev) => {
              if (ev.target === ev.currentTarget) {
                dialog.resolve(false);
                setDialog(null);
              }
            }}
          >
            <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
              <b id="dialog-title">{dialog.title}</b>
              <p>{dialog.body}</p>
              <div className="dialog-actions">
                <button
                  className="btn lg"
                  onClick={() => {
                    dialog.resolve(false);
                    setDialog(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className={`btn lg ${dialog.danger ? "danger" : "primary"}`}
                  autoFocus
                  onClick={() => {
                    dialog.resolve(true);
                    setDialog(null);
                  }}
                >
                  {dialog.ok}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className={`toast${toastMsg ? " show" : ""}`} role="status">
          {toastMsg?.text}
        </div>
      </div>
    </AppCtx.Provider>
  );
}

function ThemeButton() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("sq-theme", next);
    } catch {}
  };
  return (
    <button className="icon-btn theme-btn" aria-label="Toggle dark mode" onClick={toggle}>
      <svg className="moon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg className="sun" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}

// The avatar in the top bar: a small menu with the profile and signing out.
function ProfileMenu({ me }: { me: Profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const items = [
    { href: "/me", label: "Edit profile", icon: "pen" },
    { href: "/venue", label: me.role === "user" ? "Become a venue" : "Venue", icon: "shield" },
    ...(me.role === "admin" ? [{ href: "/admin", label: "Venue requests", icon: "flag" }] : []),
  ];
  return (
    <div className="pmenu" ref={ref}>
      <button className="icon-btn" aria-label="Your account" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" style={{ background: me.color, width: 28, height: 28, boxShadow: open ? "0 0 0 2px var(--accent)" : undefined }}>
          {initials(me.display_name ?? me.username)}
        </span>
      </button>
      <div className={`pmenu-list${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="pmenu-name">
          <b>{me.display_name ?? me.username}</b>
          <span>@{me.username}</span>
        </div>
        {items.map((it) => (
          <Link key={it.href} href={it.href} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
            <Ic name={it.icon} size={16} />
            {it.label}
          </Link>
        ))}
        <button
          tabIndex={open ? 0 : -1}
          className="pmenu-out"
          onClick={async () => {
            await createClient().auth.signOut();
            window.location.replace("/login");
          }}
        >
          <Ic name="back" size={16} />
          Log out
        </button>
      </div>
    </div>
  );
}

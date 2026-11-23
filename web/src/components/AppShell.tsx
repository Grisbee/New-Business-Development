"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Ic } from "@/components/Icons";
import { useAppData, type AppData } from "@/lib/useAppData";
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
  { id: "public", label: "Public", icon: "ticket" },
  { id: "community", label: "Community", icon: "users" },
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
  mineFilter: "all" | "public" | "community";
  calDay: string;
  uniDay: string;
};

type Ctx = {
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
  const today = todayIso();
  const [uni, setUni] = useState(false);
  const [tab, setTabState] = useState<Tab>("public");
  const [ui, setUiState] = useState<UiState>({
    tag: { public: null, community: null, threads: null },
    panel: { public: null, community: null, threads: null },
    q: { public: "", community: "", threads: "" },
    range: { public: null, community: null },
    threadSeg: "mine",
    mineFilter: "all",
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
  const viewRef = useRef<HTMLElement>(null);

  // The tab lives in the URL hash, as in the mockup, so reloads keep it.
  useEffect(() => {
    const start = window.location.hash.slice(1) as Tab;
    if ([...TABS, ...UNI_TABS].some((t) => t.id === start)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the hash once on mount
      setTabState(start);
      if (UNI_TABS.some((t) => t.id === start)) setUni(true);
    }
  }, []);

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
      if (mine) {
        const { error } = await data.supabase.from("going").delete().eq("event_id", e.id).eq("user_id", me.id);
        if (error) return toast(`Couldn’t leave: ${error.message}`);
        toast(mine.status === "waitlist" ? "You left the waitlist" : "You left this event");
      } else {
        const { data: row, error } = await data.supabase.from("going").insert({ event_id: e.id }).select("status").single();
        if (error) return toast(`Couldn’t join: ${error.message}`);
        toast(row.status === "waitlist" ? "Added to the waitlist" : "You’re going · group chat is in My events");
      }
      await Promise.all([data.loadGoing(), data.loadEvents(), data.loadChats()]);
    },
    [data, me.id, toast],
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
    setTab(next ? "teams" : "public");
    toast(next ? "University mode" : "City mode");
  };

  const ctx: Ctx = {
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
      mine: sum("event"),
      teams: sum("team"),
    } as Partial<Record<Tab, number>>;
  }, [data.chats]);

  const fabShown = (tab === "public" && (me.role === "venue" || me.role === "admin")) || tab === "community" || tab === "ucal";
  const onFab = () => {
    if (tab === "ucal") setSheet({ kind: "cal", type: "exam" });
    else if (tab === "public") setSheet({ kind: "event", eventKind: "public" });
    else setSheet({ kind: "event", eventKind: "community" });
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
          <div className="logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- small inline brand mark */}
            <img src="/icons/sidequest-icon.svg" alt="" />
            <span>Side<span className="brand">Quest</span></span>
          </div>
          <span className="spacer" />
          <button className="mode" aria-pressed={uni} onClick={() => setMode(!uni)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 9 12 4 2 9l10 5 10-5z" />
              <path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6" />
            </svg>
            University
          </button>
          <ThemeButton />
          <Link href="/me" className="icon-btn" aria-label="Your profile" title={me.display_name ?? me.username ?? "Profile"}>
            <span className="avatar" style={{ background: me.color, width: 28, height: 28 }}>
              {initials(me.display_name ?? me.username)}
            </span>
          </Link>
        </header>

        <main className="view" id="view" ref={viewRef}>
          {!data.loaded ? <div className="empty">Loading…</div> : views[tab]}
          {data.error && <div className="empty">Something went wrong: {data.error}</div>}
        </main>

        <button className="fab" aria-label="Create" hidden={!fabShown} onClick={onFab}>
          <Ic name="plus" size={24} width={2.6} />
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

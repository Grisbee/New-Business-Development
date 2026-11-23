"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { chatTime } from "@/lib/format";
import { nameOf } from "@/lib/types";

type Note = {
  id: number;
  type: string;
  event_id: string | null;
  event_title: string | null;
  created_at: string;
  read_at: string | null;
  actor: { username: string | null; display_name: string | null } | null;
  event: { title: string } | null;
};

const SELECT =
  "id, type, event_id, event_title, created_at, read_at, actor:profiles!notifications_actor_id_fkey(username, display_name), event:events(title)";

function text(n: Note): { text: React.ReactNode; emoji: string } {
  const who = <b>{nameOf(n.actor)}</b>;
  const ev = <b>{n.event?.title ?? n.event_title ?? "an event"}</b>;
  switch (n.type) {
    case "join_request":
      return { emoji: "🙋", text: <>{who} asks to join {ev}</> };
    case "request_approved":
      return { emoji: "🎉", text: <>{who} approved your request for {ev}</> };
    case "request_declined":
      return { emoji: "😔", text: <>Your request for {ev} wasn’t accepted this time</> };
    case "joined":
      return { emoji: "👋", text: <>{who} joined {ev}</> };
    case "waitlist_promoted":
      return { emoji: "🎉", text: <>A spot opened up: you’re going to {ev}</> };
    case "venue_approved":
      return { emoji: "✅", text: <>You’re a verified venue now. List your first public event!</> };
    case "venue_rejected":
      return { emoji: "📝", text: <>Your venue request wasn’t approved. You can send a new one.</> };
    case "event_updated":
      return { emoji: "✏️", text: <>{who} changed the time or place of {ev}. Check the details</> };
    case "event_cancelled":
      return { emoji: "🚫", text: <>{who} cancelled {ev}</> };
    default:
      return { emoji: "🔔", text: <>Something new</> };
  }
}

// The bell in the top bar: latest notifications, live, with an unread count.
export function Bell({ userId, onOpenEvent }: { userId: string; onOpenEvent: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("notifications").select(SELECT).order("created_at", { ascending: false }).limit(30);
    setNotes((data ?? []) as unknown as Note[]);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on mount
    void load();
    const channel = supabase
      .channel(`bell:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, userId, load]);

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

  const unread = notes.filter((n) => !n.read_at).length;

  async function markRead(ids: number[]) {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  }

  function openNote(n: Note) {
    void markRead([n.id]);
    setOpen(false);
    if (n.type.startsWith("venue_")) router.push("/venue");
    else if (n.event_id && n.event) onOpenEvent(n.event_id);
  }

  return (
    <div className="pmenu" ref={ref}>
      <button className="icon-btn bell" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="badge bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <div className={`pmenu-list notes${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="notes-head">
          <b>Notifications</b>
          {unread > 0 && (
            <button tabIndex={open ? 0 : -1} onClick={() => void markRead(notes.filter((n) => !n.read_at).map((n) => n.id))}>
              Mark all read
            </button>
          )}
        </div>
        {notes.length === 0 && <div className="notes-empty">Nothing yet. Requests and answers about your events show up here.</div>}
        <div className="notes-list">
          {notes.map((n) => {
            const t = text(n);
            return (
              <button key={n.id} tabIndex={open ? 0 : -1} className={`note${n.read_at ? "" : " unread"}`} onClick={() => openNote(n)}>
                <span className="note-emoji" aria-hidden>
                  {t.emoji}
                </span>
                <span className="note-body">
                  <span>{t.text}</span>
                  <small>{chatTime(n.created_at)}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

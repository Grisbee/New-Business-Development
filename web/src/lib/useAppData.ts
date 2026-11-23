"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, nextOccurrence, todayIso } from "@/lib/format";
import type { ChatSummary, EventRow, GoingRow, Profile, Team, Thread, UniItem } from "@/lib/types";

export const EVENT_SELECT =
  "id, kind, thread_id, host_id, title, tag, starts_on, starts_at, place, description, price, tickets, max_going, image, going_count, repeat, repeat_until, join_mode, host:profiles!events_host_id_fkey(id, username, display_name, color, tag, venue_name, role)";

// Everything the main screens show, loaded once and refreshed after writes
// and on realtime changes. Small app, so whole lists are fine.
export function useAppData(me: Profile) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [going, setGoing] = useState<Map<string, GoingRow>>(new Map());
  const [threads, setThreads] = useState<Thread[]>([]);
  const [chats, setChats] = useState<Map<string, ChatSummary>>(new Map());
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<UniItem[]>([]);
  // Open join requests on events I host: event id → how many.
  const [requests, setRequests] = useState<Map<string, number>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    // From a month back, so the calendar can show the recent past too, plus
    // every repeating event (it may have started long ago).
    const today = todayIso();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .or(`starts_on.gte.${addDays(today, -31)},and(repeat.neq.none,or(repeat_until.is.null,repeat_until.gte.${addDays(today, -31)}))`)
      .order("starts_on")
      .order("starts_at");
    if (error) return setError(error.message);
    setEvents(
      ((data ?? []) as unknown as Omit<EventRow, "next_on">[]).map((e) => ({ ...e, next_on: nextOccurrence(e, today) }) as EventRow),
    );
  }, [supabase]);

  const loadGoing = useCallback(async () => {
    const { data, error } = await supabase
      .from("going")
      .select("event_id, status, tier, qty, created_at")
      .eq("user_id", me.id);
    if (error) return setError(error.message);
    setGoing(new Map((data ?? []).map((g) => [g.event_id, g as GoingRow])));
  }, [supabase, me.id]);

  const loadRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from("going")
      .select("event_id, event:events!inner(host_id)")
      .eq("status", "requested")
      .eq("event.host_id", me.id);
    if (error) return setError(error.message);
    const m = new Map<string, number>();
    (data ?? []).forEach((r) => m.set(r.event_id, (m.get(r.event_id) ?? 0) + 1));
    setRequests(m);
  }, [supabase, me.id]);

  const loadThreads = useCallback(async () => {
    const [t, s, f] = await Promise.all([
      supabase.from("threads").select("id, name, icon, color, tag").order("name"),
      supabase.rpc("thread_stats"),
      supabase.from("follows").select("thread_id").eq("user_id", me.id),
    ]);
    if (t.error || s.error || f.error) return setError((t.error ?? s.error ?? f.error)!.message);
    type Stat = { thread_id: string; members: number; active_today: number };
    const stats = new Map<string, Stat>(((s.data ?? []) as Stat[]).map((x) => [x.thread_id, x]));
    const followed = new Set((f.data ?? []).map((x) => x.thread_id));
    setThreads(
      (t.data ?? []).map((x) => ({
        ...x,
        members: stats.get(x.id)?.members ?? 0,
        active: stats.get(x.id)?.active_today ?? 0,
        followed: followed.has(x.id),
      })),
    );
  }, [supabase, me.id]);

  const loadChats = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_chats");
    if (error) return setError(error.message);
    setChats(new Map(((data ?? []) as ChatSummary[]).map((c) => [c.chat_key, c])));
  }, [supabase]);

  const loadTeams = useCallback(async () => {
    const [t, m, i] = await Promise.all([
      supabase.from("teams").select("id, name, course_code, course_name, icon, color, join_code").order("created_at"),
      supabase.from("team_members").select("team_id"),
      supabase.from("uni_items").select("id, kind, team_id, user_id, course, title, due_on, due_at, place").order("due_on").order("due_at"),
    ]);
    if (t.error || m.error || i.error) return setError((t.error ?? m.error ?? i.error)!.message);
    const counts = new Map<string, number>();
    (m.data ?? []).forEach((x) => counts.set(x.team_id, (counts.get(x.team_id) ?? 0) + 1));
    setTeams((t.data ?? []).map((x) => ({ ...x, member_count: counts.get(x.id) ?? 1 })));
    setItems((i.data ?? []) as UniItem[]);
  }, [supabase]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadEvents(), loadGoing(), loadThreads(), loadChats(), loadTeams(), loadRequests()]);
    setLoaded(true);
  }, [loadEvents, loadGoing, loadThreads, loadChats, loadTeams, loadRequests]);

  useEffect(() => {
    // Initial load; the setState calls happen after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    void reloadAll();
  }, [reloadAll]);

  // Realtime: new messages refresh previews and badges; going/event changes
  // refresh counts. Debounced, since a burst of changes needs one reload.
  // Loaders asked for by realtime events, run together 300 ms after the
  // last one (a burst needs one reload; none of them may be dropped).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef(new Set<() => Promise<unknown>>());
  useEffect(() => {
    const schedule = (...fns: (() => Promise<unknown>)[]) => {
      fns.forEach((f) => queued.current.add(f));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const run = [...queued.current];
        queued.current.clear();
        void Promise.all(run.map((f) => f()));
      }, 300);
    };
    const today = todayIso();
    const channel = supabase
      .channel("app")
      // RLS limits these to chats I can read.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => schedule(loadChats))
      // My own joins, approvals and waitlist moves.
      .on("postgres_changes", { event: "*", schema: "public", table: "going", filter: `user_id=eq.${me.id}` }, () =>
        schedule(loadGoing, loadChats),
      )
      // Requests and answers reach me as notifications.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, () =>
        schedule(loadRequests, loadGoing, loadEvents),
      )
      // Counts and edits: patch the row in place; new or removed events reload.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, (payload) => {
        const row = payload.new as Omit<EventRow, "host" | "next_on">;
        setEvents((list) => list.map((e) => (e.id === row.id ? { ...e, ...row, host: e.host, next_on: nextOccurrence(row, today) } : e)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, () => schedule(loadEvents))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, () => schedule(loadEvents, loadGoing, loadChats))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, me.id, loadChats, loadEvents, loadGoing, loadRequests]);

  return {
    supabase,
    events,
    going,
    threads,
    chats,
    teams,
    items,
    requests,
    loadRequests,
    loaded,
    error,
    loadEvents,
    loadGoing,
    loadThreads,
    loadChats,
    loadTeams,
    reloadAll,
  };
}

export type AppData = ReturnType<typeof useAppData>;

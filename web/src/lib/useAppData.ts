"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addDays, nextOccurrence, todayIso } from "@/lib/format";
import type { ChatSummary, EventRow, GoingRow, Profile, Team, Thread, UniItem } from "@/lib/types";

export const EVENT_SELECT =
  "id, kind, thread_id, host_id, title, tag, starts_on, starts_at, place, description, price, tickets, max_going, image, going_count, repeat, repeat_until, host:profiles!events_host_id_fkey(id, username, display_name, color, tag, venue_name, role)";

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
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    // From a month back, so the calendar can show the recent past too, plus
    // every repeating event (it may have started long ago).
    const today = todayIso();
    const { data, error } = await supabase
      .from("events")
      .select(EVENT_SELECT)
      .or(`starts_on.gte.${addDays(today, -31)},repeat.neq.none`)
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
    await Promise.all([loadEvents(), loadGoing(), loadThreads(), loadChats(), loadTeams()]);
    setLoaded(true);
  }, [loadEvents, loadGoing, loadThreads, loadChats, loadTeams]);

  useEffect(() => {
    // Initial load; the setState calls happen after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    void reloadAll();
  }, [reloadAll]);

  // Realtime: new messages refresh previews and badges; going/event changes
  // refresh counts. Debounced, since a burst of changes needs one reload.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = (fn: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fn, 300);
    };
    const channel = supabase
      .channel("app")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => schedule(() => void loadChats()))
      .on("postgres_changes", { event: "*", schema: "public", table: "going" }, () =>
        schedule(() => void Promise.all([loadEvents(), loadGoing(), loadChats()])),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => schedule(() => void loadEvents()))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadChats, loadEvents, loadGoing]);

  return {
    supabase,
    events,
    going,
    threads,
    chats,
    teams,
    items,
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

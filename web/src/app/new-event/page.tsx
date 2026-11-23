import { redirect } from "next/navigation";
import { EventEditor } from "@/components/EventEditor";
import { requireMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "New event · SideQuest" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ kind?: string; thread?: string }> }) {
  const me = await requireMe();
  const { kind: k, thread } = await searchParams;
  const kind = k === "public" ? "public" : "community";
  // The database refuses public events from others anyway; this just sends
  // them to the venue request instead of a form that can't be posted.
  if (kind === "public" && me.role === "user") redirect("/venue");

  const supabase = await createClient();
  const { data: follows } = await supabase
    .from("follows")
    .select("thread:threads(id, name, tag, color, icon)")
    .eq("user_id", me.id);
  const threads = (follows ?? [])
    .map((f) => f.thread as unknown as { id: string; name: string; tag: string; color: string; icon: string } | null)
    .filter((t): t is NonNullable<typeof t> => !!t)
    .sort((a, b) => a.name.localeCompare(b.name));

  return <EventEditor me={me} kind={kind} threads={threads} threadId={thread && threads.some((t) => t.id === thread) ? thread : null} />;
}

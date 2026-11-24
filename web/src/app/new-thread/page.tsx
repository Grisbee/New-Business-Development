import { redirect } from "next/navigation";
import { ThreadEditor, type EditableThread } from "@/components/ThreadEditor";
import { requireMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sidequest · SideQuest" };

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const me = await requireMe();
  const { edit } = await searchParams;
  if (edit) {
    const supabase = await createClient();
    const { data: t } = await supabase.from("threads").select("id, name, tag, icon, color, created_by").eq("id", edit).maybeSingle();
    // The creator or an admin (RLS refuses other updates anyway).
    if (!t || (t.created_by !== me.id && me.role !== "admin")) redirect("/#threads");
    return <ThreadEditor initial={t as EditableThread} />;
  }
  return <ThreadEditor />;
}

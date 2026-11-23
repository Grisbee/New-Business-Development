import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { Profile } from "@/lib/types";

export default async function Home() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("profiles")
    .select("id, username, first_name, last_short, display_name, tag, university, color, role, venue_name")
    .eq("id", userId)
    .single();
  if (!me) redirect("/login");
  if (!me.username || !me.first_name) redirect("/onboarding");
  return <AppShell me={me as Profile} />;
}

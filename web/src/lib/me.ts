import { redirect } from "next/navigation";
import { createClient, getUserId } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// The signed-in user's profile for server pages; signs out strays.
export async function requireMe(): Promise<Profile> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, tag, university, color, role, venue_name")
    .eq("id", userId)
    .single();
  if (!data) redirect("/login");
  return data as Profile;
}

import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ReviewButtons } from "@/components/auth/VenueForms";
import { requireMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin · SideQuest" };

export default async function AdminPage() {
  const me = await requireMe();
  if (me.role !== "admin") redirect("/");
  const supabase = await createClient();
  // RLS shows admins every request.
  const { data: requests, error } = await supabase
    .from("venue_requests")
    .select("id, venue_name, area, website, note, status, created_at, requester:profiles!venue_requests_user_id_fkey(username)")
    .order("created_at", { ascending: false })
    .limit(100);
  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const done = (requests ?? []).filter((r) => r.status !== "pending");
  type Req = NonNullable<typeof requests>[number];
  const who = (r: Req) => (r.requester as unknown as { username: string | null } | null)?.username ?? "unknown";

  return (
    <AuthCard title="Venue requests" back="/">
      {error && <p className="error">{error.message}</p>}
      {pending.length === 0 && <p className="auth-sub">Nothing waiting.</p>}
      {pending.map((r) => (
        <div key={r.id} className="card">
          <h3>{r.venue_name}</h3>
          <div className="sub">
            by {who(r)}
            {r.area ? ` · ${r.area}` : ""}
          </div>
          {r.website && (
            <a href={r.website} target="_blank" rel="noopener noreferrer">
              {r.website}
            </a>
          )}
          {r.note && <div className="sub">{r.note}</div>}
          <ReviewButtons id={r.id} />
        </div>
      ))}
      {done.length > 0 && <h2>Reviewed</h2>}
      {done.map((r) => (
        <div key={r.id} className="sub">
          {r.venue_name} · {who(r)} · <b>{r.status}</b>
        </div>
      ))}
    </AuthCard>
  );
}

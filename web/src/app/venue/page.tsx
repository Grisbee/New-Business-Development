import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { VenueRequestForm } from "@/components/auth/VenueForms";
import { requireMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Venues · SideQuest" };

export default async function VenuePage() {
  const me = await requireMe();
  if (me.role === "venue" || me.role === "admin") {
    return (
      <AuthCard title="You’re a verified venue" back="/">
        <p className="auth-sub">
          {me.venue_name ? <b>{me.venue_name}</b> : "Your account"} can list public events. Open the <b>Public</b> tab and tap <b>+</b>.
          Tickets are bookings only: people pay at the door.
        </p>
        <Link className="btn primary lg" href="/#public">
          Go to Public events
        </Link>
      </AuthCard>
    );
  }

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("venue_requests")
    .select("id, venue_name, status, created_at")
    .eq("user_id", me.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = requests?.[0];

  return (
    <AuthCard title="List your events" back="/" sub="Bars, clubs and venues in Taipei can post public events once we’ve checked them.">
      {last?.status === "pending" ? (
        <p className="ok">
          Your request for <b>{last.venue_name}</b> is waiting for review. We’ll switch your account on once it’s approved.
        </p>
      ) : (
        <>
          {last?.status === "rejected" && <p className="error">Your last request ({last.venue_name}) wasn’t approved. You can send a new one.</p>}
          <VenueRequestForm />
        </>
      )}
      <Link className="btn lg" href="/">
        Back to the app
      </Link>
    </AuthCard>
  );
}

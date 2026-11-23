"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function VenueRequestForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const val = (k: string) => String(f.get(k) ?? "").trim() || null;
        setBusy(true);
        const { error } = await createClient()
          .from("venue_requests")
          .insert({ venue_name: val("venue_name"), area: val("area"), website: val("website"), note: val("note") });
        setBusy(false);
        if (error) return setError(error.code === "23505" ? "You already have a request waiting." : error.message);
        router.refresh();
      }}
    >
      <label className="field">
        Venue name
        <input name="venue_name" required minLength={2} maxLength={60} placeholder="e.g. The Copper Room" />
      </label>
      <label className="field">
        Area
        <input name="area" maxLength={60} placeholder="e.g. Gongguan, Da’an" />
      </label>
      <label className="field">
        Website or social page
        <input name="website" type="url" maxLength={200} placeholder="https://" />
      </label>
      <label className="field">
        Anything we should know?
        <textarea name="note" maxLength={500} placeholder="What kind of events you run, how to reach you…" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary lg" disabled={busy}>
        Send request
      </button>
    </form>
  );
}

export function ReviewButtons({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const review = async (approve: boolean) => {
    setBusy(true);
    const { error } = await createClient().rpc("review_venue_request", { p_request: id, p_approve: approve });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button className="btn primary" disabled={busy} onClick={() => void review(true)}>
        Approve
      </button>
      <button className="btn" disabled={busy} onClick={() => void review(false)}>
        Reject
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

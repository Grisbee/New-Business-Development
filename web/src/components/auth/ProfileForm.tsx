"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { USER_COLORS } from "@/lib/format";

export const UNIVERSITIES = ["NTU", "NTUST", "NTNU", "NCCU", "NTUT", "TMU", "NYCU", "Other"];
const STATUSES = ["Exchange", "Degree student", "Expat", "Local"];

// Username, who you are and your university: shown under your name in
// "Who's going" and chats. Used for onboarding and for editing later.
export function ProfileForm({
  userId,
  initial,
  submitLabel,
  then,
}: {
  userId: string;
  initial: { username: string | null; tag: string | null; university: string | null; color: string };
  submitLabel: string;
  then: string;
}) {
  const [status, uni0] = (initial.tag ?? "").split(" · ");
  const [color, setColor] = useState(initial.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username")).trim().toLowerCase();
    const st = String(f.get("status"));
    const uni = String(f.get("university"));
    if (!/^[a-z0-9._]{3,20}$/.test(username)) return setError("3–20 characters: letters, numbers, dots and underscores.");
    setBusy(true);
    const { error } = await createClient()
      .from("profiles")
      .update({ username, tag: uni && uni !== "Other" ? `${st} · ${uni}` : st, university: uni || null, color })
      .eq("id", userId)
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(error.code === "23505" ? "That username is taken." : error.message);
    window.location.replace(then);
  }

  return (
    <form onSubmit={save}>
      <label className="field">
        Username
        <input name="username" required defaultValue={initial.username ?? ""} maxLength={20} autoCapitalize="none" placeholder="e.g. marco.it" />
      </label>
      <div className="row2">
        <label className="field">
          I’m a…
          <select name="status" defaultValue={status || STATUSES[0]}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          University
          <select name="university" defaultValue={initial.university ?? uni0 ?? "NTUST"}>
            {UNIVERSITIES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        Colour
        <div className="panel-chips">
          {USER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              className="avatar"
              style={{ background: c, width: 32, height: 32, boxShadow: c === color ? "0 0 0 2px var(--accent)" : undefined }}
            />
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn primary lg" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <button
      className="btn lg"
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.replace("/login");
      }}
    >
      Sign out
    </button>
  );
}

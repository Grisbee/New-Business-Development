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
  const [status0] = (initial.tag ?? "").split(" · ");
  const [status, setStatus] = useState(STATUSES.includes(status0) ? status0 : STATUSES[0]);
  // A university not on the list is kept as typed, under "Other".
  const known = UNIVERSITIES.includes(initial.university ?? "") ? initial.university! : null;
  const [uni, setUni] = useState(known ?? (initial.university ? "Other" : "NTUST"));
  const [otherUni, setOtherUni] = useState(known ? "" : (initial.university ?? ""));
  const [color, setColor] = useState(initial.color);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username")).trim().toLowerCase();
    const university = uni === "Other" ? otherUni.trim() : uni;
    if (!/^[a-z0-9._]{3,20}$/.test(username)) return setError("3–20 characters: letters, numbers, dots and underscores.");
    if (!university) return setError("Type your university’s name.");
    setBusy(true);
    const { error } = await createClient()
      .from("profiles")
      .update({ username, tag: `${status} · ${university}`.slice(0, 40), university, color })
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
      <div className="field">
        I’m a…
        <div className="panel-chips">
          {STATUSES.map((s) => (
            <button key={s} type="button" className={`chip${status === s ? " active" : ""}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        University
        <div className="panel-chips">
          {UNIVERSITIES.map((u) => (
            <button key={u} type="button" className={`chip${uni === u ? " active" : ""}`} aria-pressed={uni === u} onClick={() => setUni(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
      {uni === "Other" && (
        <label className="field">
          Your university
          <input value={otherUni} onChange={(e) => setOtherUni(e.target.value)} required maxLength={30} autoFocus placeholder="e.g. Fu Jen Catholic University" />
        </label>
      )}
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

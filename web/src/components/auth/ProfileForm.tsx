"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { USER_COLORS } from "@/lib/format";

export const UNIVERSITIES = ["NTU", "NTUST", "NTNU", "NCCU", "NTUT", "TMU", "NYCU", "Other"];
const STATUSES = ["Exchange student", "Degree student", "Other"];
// Only students pick a university.
const STUDENT = new Set(["Exchange student", "Degree student"]);
// Ten, so the row of swatches fills the width.
const COLORS = [...USER_COLORS, "#A8D8EA", "#FFD6A5", "#CDB4DB"];

// Username, who you are and your university: shown under your name in
// "Who's going" and chats. Used for onboarding and for editing later.
export function ProfileForm({
  userId,
  initial,
  submitLabel,
  then,
}: {
  userId: string;
  initial: { username: string | null; first_name: string | null; last_short: string | null; tag: string | null; university: string | null; color: string };
  submitLabel: string;
  then: string;
}) {
  const [status0] = (initial.tag ?? "").split(" · ");
  const [status, setStatus] = useState(STATUSES.includes(status0) ? status0 : status0 === "Exchange" ? "Exchange student" : STATUSES[0]);
  // A university not on the list is kept as typed, under "Other".
  const known = UNIVERSITIES.includes(initial.university ?? "") ? initial.university! : null;
  const [uni, setUni] = useState(known ?? (initial.university ? "Other" : "NTUST"));
  const [otherUni, setOtherUni] = useState(known ? "" : (initial.university ?? ""));
  const [color, setColor] = useState(initial.color);
  const [first, setFirst] = useState(initial.first_name ?? "");
  const [last, setLast] = useState(initial.last_short ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const student = STUDENT.has(status);
    const university = !student ? null : uni === "Other" ? otherUni.trim() : uni;
    const firstName = first.trim();
    // Only the first three letters are ever sent.
    const lastShort = [...last.trim()].slice(0, 3).join("");
    if (!firstName || !lastShort) return setError("Add your first and last name.");
    if (student && !university) return setError("Type your university’s name.");
    setBusy(true);
    const { error } = await createClient()
      .from("profiles")
      .update({ first_name: firstName, last_short: lastShort, tag: (university ? `${status} · ${university}` : status).slice(0, 40), university, color })
      .eq("id", userId)
      .select("id")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    window.location.replace(then);
  }

  return (
    <form onSubmit={save}>
      <div className="row2">
        <label className="field">
          First name
          <input required maxLength={30} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
        </label>
        <label className="field">
          Last name
          <input required maxLength={40} value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
        </label>
      </div>
      <span className="hint">Only the first 3 letters of your last name are saved and shown, e.g. “John Smi” instead of “John Smith”.</span>
      <label className="field">
        Username
        <input readOnly tabIndex={-1} value={usernamePreview(first, last) || ""} placeholder="made from your name" style={{ color: "var(--paper-dim)" }} />
      </label>
      <span className="hint">Made from your name. If it’s taken, a number is added (john.smi2).</span>
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
      {STUDENT.has(status) && (
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
      )}
      {STUDENT.has(status) && uni === "Other" && (
        <label className="field">
          Your university
          <input value={otherUni} onChange={(e) => setOtherUni(e.target.value)} required maxLength={30} autoFocus placeholder="e.g. Fu Jen Catholic University" />
        </label>
      )}
      <div className="field">
        Colour
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              className="swatch"
              style={{ background: c, boxShadow: c === color ? "0 0 0 2px var(--ink), 0 0 0 4px var(--accent)" : undefined }}
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

// The same rule the database uses (private.username_for), for the preview.
function usernamePreview(first: string, last: string) {
  const plain = (x: string) =>
    x.trim().toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const short = [...last.trim()].slice(0, 3).join("");
  let base = plain(first) + (short ? `.${plain(short)}` : "");
  base = base.replace(/[^a-z0-9.]+/g, "").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  if (!first.trim()) return "";
  if (base.length < 3) base += "user";
  return base.slice(0, 17);
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

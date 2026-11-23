"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { Ic } from "@/components/Icons";
import { USER_COLORS } from "@/lib/format";

export type SheetState =
  | { kind: "cal"; type: "exam" | "deadline" | "other" }
  | { kind: "deadline"; teamId: string }
  | { kind: "team" };

const KIND_LABEL = { deadline: "Deadline", exam: "Exam", other: "Other" } as const;
const TEAM_ICONS = ["bulb", "gear", "chart", "lang", "code", "pen", "palette", "leaf", "music", "game"];

export function SheetHost({ sheet, onClose }: { sheet: SheetState; onClose: () => void }) {
  // Clicking the dimmed backdrop (not the form) closes it.
  return (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {sheet.kind === "team" ? (
        <TeamSheet onClose={onClose} />
      ) : (
        <ItemSheet sheet={sheet} onClose={onClose} />
      )}
    </div>
  );
}

function Head({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <div className="sheet-head">
      <b>
        {title}
        <small>{sub}</small>
      </b>
      <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
        <Ic name="x" size={20} width={2.2} />
      </button>
    </div>
  );
}

/* ------------------------------------------------- deadline / calendar item */

function ItemSheet({ sheet, onClose }: { sheet: Extract<SheetState, { kind: "cal" | "deadline" }>; onClose: () => void }) {
  const { data, ui, setUi, today, toast } = useApp();
  const team = sheet.kind === "deadline" ? data.teams.find((t) => t.id === sheet.teamId) : null;
  const [type, setType] = useState<"exam" | "deadline" | "other">(sheet.kind === "cal" ? sheet.type : "deadline");
  const [busy, setBusy] = useState(false);
  const courses = [...new Set(data.teams.map((t) => t.course_code).concat(data.items.map((i) => i.course)))];

  async function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    const { data: row, error } = await data.supabase
      .from("uni_items")
      .insert({
        kind: team ? "deadline" : type,
        team_id: team?.id ?? null,
        course: team ? team.course_code : val("course").toUpperCase(),
        title: val("title"),
        due_on: val("date"),
        due_at: val("time"),
        place: team ? null : val("place") || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return toast(`Couldn’t add: ${error.message}`);
    }
    if (team) {
      const m = await data.supabase.from("messages").insert({ team_id: team.id, kind: "deadline", ref_item: row.id });
      if (m.error) toast(`Added, but not posted to the chat: ${m.error.message}`);
    }
    setUi((u) => ({ ...u, uniDay: val("date") }));
    await Promise.all([data.loadTeams(), data.loadChats()]);
    toast(team ? "Deadline added · also in Calendar" : `${KIND_LABEL[type]} added to Calendar`);
    onClose();
  }

  return (
    <form className="sheet" onSubmit={save}>
      <Head title={team ? "New deadline" : "Add to calendar"} sub={team ? `Shared with ${team.name}` : "Only visible to you"} onClose={onClose} />
      {!team && (
        <div className="panel-chips">
          {(["exam", "deadline", "other"] as const).map((k) => (
            <button key={k} type="button" className={`chip${type === k ? " active" : ""}`} onClick={() => setType(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        Title
        <input name="title" required minLength={2} maxLength={80} autoFocus placeholder={type === "exam" ? "e.g. Calculus final" : "e.g. Lab report 3"} />
      </label>
      {!team && (
        <label className="field">
          Course
          <input name="course" required minLength={2} maxLength={12} list="course-list" placeholder="e.g. ME3021" />
          <datalist id="course-list">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      )}
      <div className="row2">
        <label className="field">
          Date
          <input name="date" type="date" required min={today} defaultValue={ui.uniDay >= today ? ui.uniDay : today} />
        </label>
        <label className="field">
          Time
          <input name="time" type="time" required defaultValue={type === "exam" ? "09:00" : "23:59"} />
        </label>
      </div>
      {!team && (
        <label className="field">
          Where (optional)
          <input name="place" maxLength={80} placeholder="e.g. Engineering Hall, Room 101" />
        </label>
      )}
      <span className="hint">{team ? "The deadline is posted in the team chat and shows up in everyone’s Calendar." : "Shows up in your Calendar."}</span>
      <button className="btn primary lg" type="submit" disabled={busy}>
        {team ? "Add deadline" : "Add"}
      </button>
    </form>
  );
}

/* --------------------------------------------------------- create / join */

function TeamSheet({ onClose }: { onClose: () => void }) {
  const { data, toast, openChat } = useApp();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [icon, setIcon] = useState("bulb");
  const [busy, setBusy] = useState(false);

  async function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    const res =
      mode === "create"
        ? await data.supabase.rpc("create_team", {
            p_name: val("name"),
            p_course_code: val("code"),
            p_course_name: val("course"),
            p_icon: icon,
            p_color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
          })
        : await data.supabase.rpc("join_team", { p_code: val("join") });
    setBusy(false);
    if (res.error) return toast(res.error.message);
    if (!res.data) return toast("No team with that PIN");
    await Promise.all([data.loadTeams(), data.loadChats()]);
    toast(mode === "create" ? "Team created · share its PIN to invite people" : "You joined the team");
    onClose();
    openChat({ type: "team", id: res.data as string });
  }

  return (
    <form className="sheet" onSubmit={save}>
      <Head title={mode === "create" ? "New team" : "Join a team"} sub="For course projects and study groups" onClose={onClose} />
      <div className="seg" style={{ margin: 0 }}>
        <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>
          Create
        </button>
        <button type="button" className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>
          Join with a PIN
        </button>
      </div>
      {mode === "create" ? (
        <>
          <label className="field">
            Team name
            <input name="name" required minLength={2} maxLength={60} autoFocus placeholder="e.g. Machine Design II — Group 4" />
          </label>
          <div className="row2">
            <label className="field">
              Course code
              <input name="code" required minLength={2} maxLength={12} placeholder="e.g. ME3021 (on your timetable)" />
            </label>
            <label className="field">
              Course name
              <input name="course" maxLength={60} placeholder="optional" />
            </label>
          </div>
          <div className="panel-chips">
            {TEAM_ICONS.map((i) => (
              <button key={i} type="button" className={`chip${icon === i ? " active" : ""}`} aria-label={i} onClick={() => setIcon(i)}>
                <Ic name={i} size={16} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <label className="field">
          Team PIN
          <input name="join" required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoFocus placeholder="6 digits from a teammate" autoComplete="off" />
        </label>
      )}
      <button className="btn primary lg" type="submit" disabled={busy}>
        {mode === "create" ? "Create team" : "Join"}
      </button>
    </form>
  );
}

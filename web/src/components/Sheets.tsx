"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { TAGS } from "@/components/views/Lists";
import { Ic } from "@/components/Icons";
import { USER_COLORS } from "@/lib/format";
import type { Ticket } from "@/lib/types";

export type SheetState =
  | { kind: "cal"; type: "exam" | "deadline" | "other" }
  | { kind: "deadline"; teamId: string }
  | { kind: "event"; eventKind: "community" | "public"; threadId?: string }
  | { kind: "team" };

const KIND_LABEL = { deadline: "Deadline", exam: "Exam", other: "Other" } as const;
const TEAM_ICONS = ["bulb", "gear", "chart", "lang", "code", "pen", "palette", "leaf", "music", "game"];

export function SheetHost({ sheet, onClose }: { sheet: SheetState; onClose: () => void }) {
  // Clicking the dimmed backdrop (not the form) closes it.
  return (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {sheet.kind === "event" ? (
        <EventSheet sheet={sheet} onClose={onClose} />
      ) : sheet.kind === "team" ? (
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

/* ------------------------------------------------------------ new event */

function EventSheet({ sheet, onClose }: { sheet: Extract<SheetState, { kind: "event" }>; onClose: () => void }) {
  const { data, me, today, toast, openDetail } = useApp();
  const pub = sheet.eventKind === "public";
  const followed = data.threads.filter((t) => t.followed);
  const [threadId, setThreadId] = useState(sheet.threadId ?? "");
  const thread = data.threads.find((t) => t.id === threadId);
  const [tiers, setTiers] = useState<Ticket[]>([]);
  const [busy, setBusy] = useState(false);
  const defaultTag = thread && TAGS.community.includes(thread.tag) ? thread.tag : pub ? TAGS.public[0] : "Outdoors";

  async function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);

    let image: string | null = null;
    const photo = f.get("photo");
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > 8 * 1024 * 1024) {
        setBusy(false);
        return toast("Photos up to 8 MB");
      }
      const path = `${me.id}/${crypto.randomUUID()}.${(photo.name.split(".").pop() || "jpg").toLowerCase().slice(0, 4)}`;
      const up = await data.supabase.storage.from("event-images").upload(path, photo, { contentType: photo.type });
      if (up.error) {
        setBusy(false);
        return toast(`Photo upload failed: ${up.error.message}`);
      }
      image = path;
    }

    const cleanTiers = tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), note: t.note?.trim() || null, price: Math.max(0, Math.round(t.price)) }));
    const { data: row, error } = await data.supabase
      .from("events")
      .insert({
        kind: sheet.eventKind,
        thread_id: pub ? null : threadId || null,
        title: val("title"),
        tag: val("tag"),
        starts_on: val("date"),
        starts_at: val("time"),
        place: val("place"),
        description: val("description") || null,
        price: pub && !cleanTiers.length ? Number(val("price") || 0) : 0,
        tickets: pub ? cleanTiers : [],
        max_going: pub ? null : Math.max(2, Number(val("max") || 8)),
        image,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return toast(`Couldn’t post: ${error.message}`);
    }
    if (!pub && threadId) {
      const m = await data.supabase.from("messages").insert({ thread_id: threadId, kind: "event", ref_event: row.id });
      if (m.error) toast(`Posted, but not shared in the thread: ${m.error.message}`);
    }
    await Promise.all([data.loadEvents(), data.loadChats()]);
    toast(pub ? "Event listed in Public" : "Event posted · also in Community and Calendar");
    onClose();
    openDetail(row.id);
  }

  return (
    <form className="sheet" onSubmit={save} style={{ maxHeight: "92%", overflowY: "auto" }}>
      <Head
        title="New event"
        sub={pub ? `Listed by ${me.venue_name ?? "your venue"}` : thread ? `Posted in ${thread.name}` : "Community event"}
        onClose={onClose}
      />
      <label className="field">
        Title
        <input name="title" required minLength={3} maxLength={80} autoFocus placeholder={pub ? "e.g. Jazz night with the house band" : "e.g. Night fishing at Tamsui pier"} />
      </label>
      <div className="row2">
        <label className="field">
          Date
          <input name="date" type="date" required min={today} defaultValue={today} />
        </label>
        <label className="field">
          Time
          <input name="time" type="time" required defaultValue={pub ? "20:00" : "18:00"} />
        </label>
      </div>
      <label className="field">
        Place
        <input name="place" required minLength={2} maxLength={80} placeholder={pub ? "e.g. The Copper Room · Gongguan" : "e.g. Tamsui MRT exit 2"} />
      </label>
      <div className="row2">
        <label className="field">
          Tag
          <select name="tag" defaultValue={defaultTag}>
            {(pub ? TAGS.public : TAGS.community).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        {pub ? (
          <label className="field">
            Entry (NT$, 0 = free)
            <input name="price" type="number" min={0} max={1000000} defaultValue={0} disabled={tiers.length > 0} />
          </label>
        ) : (
          <label className="field">
            Spots
            <input name="max" type="number" min={2} max={500} defaultValue={8} />
          </label>
        )}
      </div>
      {!pub && followed.length > 0 && (
        <label className="field">
          Thread (optional)
          <select value={threadId} onChange={(e) => setThreadId(e.target.value)}>
            <option value="">None</option>
            {followed.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {pub && (
        <div className="field">
          Tickets (optional, booked without payment)
          {tiers.map((t, i) => (
            <div key={i} className="row2" style={{ gridTemplateColumns: "1fr 1fr 90px auto" }}>
              <input placeholder="Name" value={t.name} maxLength={30} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input placeholder="Note" value={t.note ?? ""} maxLength={50} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              <input type="number" min={0} placeholder="NT$" value={t.price} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
              <button type="button" className="icon-btn" aria-label="Remove ticket" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))}>
                <Ic name="x" size={16} />
              </button>
            </div>
          ))}
          {tiers.length < 6 && (
            <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setTiers((ts) => [...ts, { name: "", note: "", price: 0 }])}>
              + Add a ticket type
            </button>
          )}
        </div>
      )}
      <label className="field">
        Description (optional)
        <input name="description" maxLength={2000} placeholder="What should people know?" />
      </label>
      <label className="field">
        Photo (optional)
        <input name="photo" type="file" accept="image/*" />
      </label>
      <span className="hint">
        {pub ? "Shows up in Public events and the Calendar." : "The event shows up in Community events and the Calendar, and in the thread’s chat if you pick one."}
      </span>
      <button className="btn primary lg" type="submit" disabled={busy}>
        {busy ? "Posting…" : "Post event"}
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
    await Promise.all([data.loadTeams(), data.loadChats()]);
    toast(mode === "create" ? "Team created · share its code to invite people" : "You joined the team");
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
          Join with a code
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
              <input name="code" required minLength={2} maxLength={12} placeholder="e.g. ME3021" />
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
          Team code
          <input name="join" required minLength={6} maxLength={6} autoFocus placeholder="e.g. 4F2A9C" style={{ textTransform: "uppercase" }} />
        </label>
      )}
      <button className="btn primary lg" type="submit" disabled={busy}>
        {mode === "create" ? "Create team" : "Join"}
      </button>
    </form>
  );
}

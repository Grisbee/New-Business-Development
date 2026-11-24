"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Ic } from "@/components/Icons";
import { TAGS, tagForThread } from "@/components/views/Lists";
import { todayIso } from "@/lib/format";
import type { EventRow, Profile, Repeat, Ticket } from "@/lib/types";
import { imageUrl } from "@/lib/format";
import { resizeImage } from "@/lib/resizeImage";

// The host counts as one of them.
const SPOTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 40, 50, 75, 100];

type ThreadLite = { id: string; name: string; tag: string; color: string; icon: string };

// The new-event page: a cover photo preview on top, then the form. Public
// events (venues) get an entry price or ticket types; community events get
// spots and an optional thread, where the event is also posted.
export type EditableEvent = Pick<
  EventRow,
  "id" | "title" | "tag" | "starts_on" | "starts_at" | "place" | "description" | "price" | "tickets" | "max_going" | "image" | "repeat" | "repeat_until" | "join_mode"
>;

// `initial` = editing that event; otherwise a new one.
export function EventEditor({
  me,
  kind,
  threads,
  threadId: initialThread,
  initial,
}: {
  me: Profile;
  kind: "public" | "community";
  threads: ThreadLite[];
  threadId: string | null;
  initial?: EditableEvent;
}) {
  const editing = !!initial;
  const supabase = useMemo(() => createClient(), []);
  const pub = kind === "public";
  const today = todayIso();
  const [threadId, setThreadId] = useState(initialThread ?? "");
  const thread = threads.find((t) => t.id === threadId);
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tiers, setTiers] = useState<Ticket[]>(initial?.tickets ?? []);
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? "none");
  // New events start with unlimited spots; edits keep what was set.
  const [unlimited, setUnlimited] = useState(!initial || initial.max_going === null);
  const [approval, setApproval] = useState(initial?.join_mode === "approval");
  // Editing: the current photo until a new one is picked or it's removed.
  const [keepImage, setKeepImage] = useState(initial?.image ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultTag = pub ? TAGS.public[0] : tagForThread(thread?.tag);
  const back = initial ? `/?event=${initial.id}${pub ? "#public" : "#community"}` : pub ? "/#public" : "/#community";

  async function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    setError(null);
    setBusy(true);
    const fail = (msg: string) => {
      setBusy(false);
      setError(msg);
    };

    let image: string | null = keepImage;
    if (photo) {
      const small = await resizeImage(photo, 1600);
      if (small.size > 8 * 1024 * 1024) return fail("Photos up to 8 MB.");
      const path = `${me.id}/${crypto.randomUUID()}.${(small.name.split(".").pop() || "jpg").toLowerCase().slice(0, 4)}`;
      const up = await supabase.storage.from("event-images").upload(path, small, { contentType: small.type });
      if (up.error) return fail(`Photo upload failed: ${up.error.message}`);
      image = path;
    }

    const cleanTiers = tiers
      .filter((t) => t.name.trim())
      .map((t) => ({ name: t.name.trim(), note: t.note?.trim() || null, price: Math.max(0, Math.round(t.price)) }));
    const fields = {
        title: val("title"),
        tag: val("tag"),
        starts_on: val("date"),
        starts_at: val("time"),
        place: val("place"),
        description: val("description") || null,
        price: pub && !cleanTiers.length ? Number(val("price") || 0) : 0,
        tickets: pub ? cleanTiers : [],
        max_going: pub || unlimited ? null : Math.max(2, Number(val("max") || 8)),
        repeat: pub ? "none" : repeat,
        join_mode: !pub && approval ? "approval" : "open",
        repeat_until: !pub && repeat !== "none" && val("until") ? val("until") : null,
        image,
    };
    if (initial) {
      const { error } = await supabase.from("events").update(fields).eq("id", initial.id).select("id").single();
      if (error) return fail(`Couldn’t save: ${error.message}`);
      window.location.replace(`/?event=${initial.id}${pub ? "#public" : "#community"}`);
      return;
    }
    const { data: row, error } = await supabase
      .from("events")
      .insert({ ...fields, kind, thread_id: pub ? null : threadId || null })
      .select("id")
      .single();
    if (error) return fail(`Couldn’t post: ${error.message}`);
    if (!pub && threadId) {
      // The event shows in the thread's chat too; if that fails the event
      // itself is still posted.
      await supabase.from("messages").insert({ thread_id: threadId, kind: "event", ref_event: row.id });
    }
    // Back to the app with the new event open; replaced so Back skips the form.
    window.location.replace(`/?event=${row.id}${pub ? "#public" : "#community"}`);
  }

  return (
    <div className="screen auth-screen">
      <header className="topbar">
        <Link href={back} className="icon-btn" aria-label="Back">
          <Ic name="back" size={22} width={2.2} />
        </Link>
        <b className="editor-title">{editing ? "Edit event" : `New ${pub ? "public" : "community"} event`}</b>
      </header>
      <main className="view">
        <form className="auth editor" onSubmit={save}>
          <button
            type="button"
            className={`cover${preview ? " has" : ""}`}
            style={
              preview || keepImage
                ? { backgroundImage: `url("${preview ?? imageUrl(keepImage)}")` }
                : thread
                  ? { background: thread.color }
                  : undefined
            }
            onClick={() => fileRef.current?.click()}
          >
            {!preview && !keepImage && (
              <span className="cover-hint">
                <Ic name="camera" size={26} width={1.8} />
                Add a cover photo
              </span>
            )}
            {(preview || keepImage) && <span className="cover-change">Change photo</span>}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPhoto(file);
            }}
          />
          {(preview || keepImage) && (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setPhoto(null);
                setKeepImage(null);
              }}
            >
              Remove photo
            </button>
          )}

          <span className="auth-sub" style={{ textAlign: "left" }}>
            {pub ? `Listed by ${me.venue_name ?? "your venue"}` : thread ? `Posted in ${thread.name}` : "Community event"}
          </span>

          <label className="field">
            Title
            <input name="title" required minLength={3} maxLength={80} autoFocus defaultValue={initial?.title} placeholder={pub ? "e.g. Jazz night with the house band" : "e.g. Night fishing at Tamsui pier"} />
          </label>
          <div className="row2">
            <label className="field">
              Date
              <input name="date" type="date" required min={editing ? undefined : today} defaultValue={initial?.starts_on ?? today} />
            </label>
            <label className="field">
              Time
              <input name="time" type="time" required defaultValue={initial?.starts_at.slice(0, 5) ?? (pub ? "20:00" : "18:00")} />
            </label>
          </div>
          <label className="field">
            Place
            <input name="place" required minLength={2} maxLength={80} defaultValue={initial?.place} placeholder={pub ? "e.g. The Copper Room · Gongguan" : "e.g. Tamsui MRT exit 2"} />
          </label>
          <div className="row2">
            <label className="field">
              Tag
              <select name="tag" key={defaultTag} defaultValue={initial?.tag ?? defaultTag}>
                {(pub ? TAGS.public : TAGS.community).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {pub ? (
              <label className="field">
                Entry (NT$, 0 = free)
                <input name="price" type="number" min={0} max={1000000} defaultValue={initial?.price ?? 0} disabled={tiers.length > 0} />
              </label>
            ) : (
              <div className="field">
                Spots
                <div className="spots">
                  <select name="max" defaultValue={initial?.max_going ?? 8} disabled={unlimited} aria-label="Spots">
                    {(initial?.max_going && !SPOTS.includes(initial.max_going) ? [...SPOTS, initial.max_going].sort((a, b) => a - b) : SPOTS).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <label className="switch">
                    <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
                    <span className="switch-track" aria-hidden />
                    Unlimited
                  </label>
                </div>
              </div>
            )}
          </div>
          {!pub && (
            <div className="field">
              Who can join
              <div className="panel-chips">
                <button type="button" className={`chip${!approval ? " active" : ""}`} aria-pressed={!approval} onClick={() => setApproval(false)}>
                  Anyone
                </button>
                <button type="button" className={`chip${approval ? " active" : ""}`} aria-pressed={approval} onClick={() => setApproval(true)}>
                  🔒 I approve requests
                </button>
              </div>
              {approval && <span className="hint">People ask to join; you say yes or no from the event. Only approved people get the group chat.</span>}
            </div>
          )}
          {!pub && (
            <div className="field">
              Repeats
              <div className="panel-chips">
                {(
                  [
                    ["none", "Just once"],
                    ["weekly", "Every week"],
                    ["biweekly", "Every 2 weeks"],
                    ["monthly", "Every month"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" className={`chip${repeat === k ? " active" : ""}`} aria-pressed={repeat === k} onClick={() => setRepeat(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!pub && repeat !== "none" && (
            <label className="field">
              Until (optional)
              <input name="until" type="date" min={today} defaultValue={initial?.repeat_until ?? undefined} />
            </label>
          )}
          {!pub && !editing && (
            <div className="field">
              Post in a sidequest
              {threads.length === 0 ? (
                <span className="hint">Follow a sidequest to post events in it; they show up in its chat and its Related events.</span>
              ) : (
                <div className="thread-pick">
                  <button type="button" className={`pick${threadId === "" ? " sel" : ""}`} aria-pressed={threadId === ""} onClick={() => setThreadId("")}>
                    <span className="thread-icon" style={{ background: "var(--ink-3)" }}>
                      <Ic name="x" size={16} />
                    </span>
                    No sidequest
                  </button>
                  {threads.map((t) => (
                    <button key={t.id} type="button" className={`pick${threadId === t.id ? " sel" : ""}`} aria-pressed={threadId === t.id} onClick={() => setThreadId(t.id)}>
                      <span className="thread-icon" style={{ background: t.color }}>
                        <Ic name={t.icon} size={16} />
                      </span>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            <textarea name="description" maxLength={2000} placeholder="What should people know?" defaultValue={initial?.description ?? undefined} />
          </label>
          <span className="hint">
            {pub
              ? "Shows up in Public events and the Calendar."
              : `Shows up in Community events and the Calendar${repeat !== "none" ? " on every date" : ""}, and in the sidequest’s chat if you pick one.${repeat !== "none" ? " One group chat for the whole series." : ""}`}
          </span>
          {error && <p className="error">{error}</p>}
          <button className="btn primary lg" type="submit" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? (editing ? "Saving…" : "Posting…") : editing ? "Save changes" : "Post event"}
          </button>
        </form>
      </main>
    </div>
  );
}

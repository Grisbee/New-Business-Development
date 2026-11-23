"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Ic } from "@/components/Icons";
import { TAGS } from "@/components/views/Lists";
import { todayIso } from "@/lib/format";
import type { Profile, Ticket } from "@/lib/types";

type ThreadLite = { id: string; name: string; tag: string; color: string; icon: string };

// The new-event page: a cover photo preview on top, then the form. Public
// events (venues) get an entry price or ticket types; community events get
// spots and an optional thread, where the event is also posted.
export function EventEditor({ me, kind, threads, threadId: initialThread }: { me: Profile; kind: "public" | "community"; threads: ThreadLite[]; threadId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const pub = kind === "public";
  const today = todayIso();
  const [threadId, setThreadId] = useState(initialThread ?? "");
  const thread = threads.find((t) => t.id === threadId);
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tiers, setTiers] = useState<Ticket[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultTag = thread && TAGS.community.includes(thread.tag) ? thread.tag : pub ? TAGS.public[0] : "Outdoors";
  const back = pub ? "/#public" : "/#community";

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

    let image: string | null = null;
    if (photo) {
      if (photo.size > 8 * 1024 * 1024) return fail("Photos up to 8 MB.");
      const path = `${me.id}/${crypto.randomUUID()}.${(photo.name.split(".").pop() || "jpg").toLowerCase().slice(0, 4)}`;
      const up = await supabase.storage.from("event-images").upload(path, photo, { contentType: photo.type });
      if (up.error) return fail(`Photo upload failed: ${up.error.message}`);
      image = path;
    }

    const cleanTiers = tiers
      .filter((t) => t.name.trim())
      .map((t) => ({ name: t.name.trim(), note: t.note?.trim() || null, price: Math.max(0, Math.round(t.price)) }));
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        kind,
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
        <b className="editor-title">New {pub ? "public" : "community"} event</b>
      </header>
      <main className="view">
        <form className="auth editor" onSubmit={save}>
          <button
            type="button"
            className={`cover${preview ? " has" : ""}`}
            style={preview ? { backgroundImage: `url(${preview})` } : thread ? { background: thread.color } : undefined}
            onClick={() => fileRef.current?.click()}
          >
            {!preview && (
              <span className="cover-hint">
                <Ic name="camera" size={26} width={1.8} />
                Add a cover photo
              </span>
            )}
            {preview && <span className="cover-change">Change photo</span>}
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
          {preview && (
            <button type="button" className="link-btn" onClick={() => setPhoto(null)}>
              Remove photo
            </button>
          )}

          <span className="auth-sub" style={{ textAlign: "left" }}>
            {pub ? `Listed by ${me.venue_name ?? "your venue"}` : thread ? `Posted in ${thread.name}` : "Community event"}
          </span>

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
          {!pub && threads.length > 0 && (
            <label className="field">
              Thread (optional)
              <select value={threadId} onChange={(e) => setThreadId(e.target.value)}>
                <option value="">None</option>
                {threads.map((t) => (
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
            <textarea name="description" maxLength={2000} placeholder="What should people know?" />
          </label>
          <span className="hint">
            {pub ? "Shows up in Public events and the Calendar." : "Shows up in Community events and the Calendar, and in the thread’s chat if you pick one."}
          </span>
          {error && <p className="error">{error}</p>}
          <button className="btn primary lg" type="submit" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Posting…" : "Post event"}
          </button>
        </form>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Ic } from "@/components/Icons";
import { TAGS } from "@/components/views/Lists";

const ICONS = ["users", "fish", "wave", "mountain", "run", "music", "moon", "bowl", "plane", "film", "palette", "lang", "game", "code", "leaf", "paw", "camera", "bulb"];
const COLORS = ["#8FC1E3", "#E8A0BF", "#F0C987", "#B8D8A8", "#C9B6F2", "#F2A488", "#7FD1C1", "#A8D8EA", "#FFD6A5", "#CDB4DB"];

// Start a community thread: name, topic tag, icon and colour. The creator
// follows it straight away (create_thread).
export function ThreadEditor() {
  const [tag, setTag] = useState(TAGS.threads[0]);
  const [icon, setIcon] = useState("users");
  const [color, setColor] = useState(COLORS[0]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc("create_thread", { p_name: name, p_tag: tag, p_icon: icon, p_color: color });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    window.location.replace(`/?thread=${data}#threads`);
  }

  return (
    <div className="screen auth-screen">
      <header className="topbar">
        <Link href="/#threads" className="icon-btn" aria-label="Back">
          <Ic name="back" size={22} width={2.2} />
        </Link>
        <b className="editor-title">New thread</b>
      </header>
      <main className="view">
        <form className="auth editor" onSubmit={save}>
          <div className="thread" style={{ borderBottom: "none", paddingTop: 0 }}>
            <span className="thread-icon" style={{ background: color }}>
              <Ic name={icon} size={22} />
            </span>
            <span className="thread-body">
              <span className="thread-name">{name.trim() || "Your thread"}</span>
              <span className="preview">{tag} · 1 member</span>
            </span>
          </div>
          <label className="field">
            Name
            <input required minLength={2} maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Taipei Board Gamers" />
          </label>
          <div className="field">
            Topic
            <div className="panel-chips">
              {TAGS.threads.map((t) => (
                <button key={t} type="button" className={`chip${tag === t ? " active" : ""}`} onClick={() => setTag(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            Icon
            <div className="panel-chips">
              {ICONS.map((i) => (
                <button key={i} type="button" className={`chip${icon === i ? " active" : ""}`} aria-label={i} aria-pressed={icon === i} onClick={() => setIcon(i)}>
                  <Ic name={i} size={16} />
                </button>
              ))}
            </div>
          </div>
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
          <span className="hint">Anyone can find it in Explore. Only people who follow it can read and write in its chat.</span>
          {error && <p className="error">{error}</p>}
          <button className="btn primary lg" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Creating…" : "Create thread"}
          </button>
        </form>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useApp, type UiState } from "@/components/AppShell";
import { Ic } from "@/components/Icons";
import { DOW, MON, REPEAT_LABEL, goingText, chatTime, dm, fmtShort, imageUrl, initials, parse, presets, priceLabel, to12h } from "@/lib/format";
import { nameOf, type ChatSummary, type EventRow, type Thread } from "@/lib/types";

// Public: what venues run. Community: what people get together for.
// Threads: what a community is about.
export const TAGS = {
  public: ["Clubs", "Live Music", "Bars", "Food", "Festivals", "Arts", "Workshops", "Markets", "Sports"],
  community: ["Sports", "Outdoors", "Trips", "Food", "Nightlife", "Culture", "Language", "Games", "Study", "Other"],
  threads: ["Outdoors", "Sports", "Music", "Nightlife", "Food", "Travel", "Culture", "Art", "Language", "Gaming", "Tech", "Study", "Wellness", "Pets", "Housing", "Volunteering"],
};

// The community tag an event gets by default when posted in a thread.
export function tagForThread(threadTag: string | undefined): string {
  if (!threadTag) return "Outdoors";
  if (TAGS.community.includes(threadTag)) return threadTag;
  return { Travel: "Trips", Gaming: "Games", Music: "Culture", Art: "Culture", Wellness: "Sports" }[threadTag] ?? "Other";
}
const PLACEHOLDER = { public: "Search events or venues", community: "Search events", threads: "Search communities" };
type ListKey = keyof typeof TAGS;

export const NoResults = () => <div className="empty">No matches. Try another word, tag or date range.</div>;

/* ---------------------------------------------------------------- toolbar */

function Toolbar({ k }: { k: ListKey }) {
  const { ui, setUi, today } = useApp();
  const p = ui.panel[k];
  const tag = ui.tag[k];
  const hasDates = k !== "threads";
  const r = hasDates ? ui.range[k as "public" | "community"] : null;
  const set = (fn: (u: UiState) => UiState) => setUi(fn);
  const setPanel = (v: "tags" | "dates") => set((u) => ({ ...u, panel: { ...u.panel, [k]: u.panel[k] === v ? null : v } }));
  const setTag = (v: string) => set((u) => ({ ...u, tag: { ...u.tag, [k]: v === "All" ? null : v }, panel: { ...u.panel, [k]: null } }));
  const setRange = (v: { from: string; to: string } | null, close = true) =>
    set((u) => ({ ...u, range: { ...u.range, [k]: v }, panel: close ? { ...u.panel, [k]: null } : u.panel }));

  const onDate = (end: "from" | "to", value: string) => {
    const cur = { ...(r ?? { from: "", to: "" }), [end]: value };
    if (cur.from && !cur.to) cur.to = cur.from;
    if (cur.to && !cur.from) cur.from = cur.to;
    if (cur.from > cur.to) [cur.from, cur.to] = [cur.to, cur.from];
    setRange(cur.from ? cur : null, false);
  };

  const cur = r ? `${r.from}|${r.to}` : "|";
  return (
    <>
      <div className="toolbar">
        <label className="searchbox">
          <Ic name="search" size={16} />
          <input
            type="search"
            autoComplete="off"
            placeholder={PLACEHOLDER[k]}
            value={ui.q[k]}
            onChange={(e) => {
              const v = e.target.value;
              set((u) => ({ ...u, q: { ...u.q, [k]: v } }));
            }}
          />
        </label>
        <button className={`tbtn${p === "tags" ? " open" : ""}${tag ? " set" : ""}`} aria-label="Tags" onClick={() => setPanel("tags")}>
          <Ic name="tag" size={18} />
        </button>
        {hasDates && (
          <button className={`tbtn${p === "dates" ? " open" : ""}${r ? " set" : ""}`} aria-label="Dates" onClick={() => setPanel("dates")}>
            <Ic name="calendar" size={18} />
          </button>
        )}
      </div>
      {p === "tags" && (
        <div className="panel">
          <span className="panel-label">Filter by tag</span>
          <div className="panel-chips">
            {["All", ...TAGS[k]].map((t) => (
              <button key={t} className={`chip${(tag || "All") === t ? " active" : ""}`} onClick={() => setTag(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {p === "dates" && (
        <div className="panel">
          <span className="panel-label">When</span>
          <div className="panel-chips">
            {presets(today).map(([l, v]) => (
              <button
                key={l}
                className={`chip${cur === v ? " active" : ""}`}
                onClick={() => {
                  const [from, to] = v.split("|");
                  setRange(from ? { from, to } : null);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="row2">
            <label className="field">
              From
              <input type="date" min={today} value={r?.from ?? ""} onChange={(e) => onDate("from", e.target.value)} />
            </label>
            <label className="field">
              To
              <input type="date" min={today} value={r?.to ?? ""} onChange={(e) => onDate("to", e.target.value)} />
            </label>
          </div>
        </div>
      )}
      {!p && (tag || r) && (
        <div className="active-filter">
          Showing{" "}
          {tag && (
            <button aria-label={`Clear tag ${tag}`} onClick={() => setTag("All")}>
              {tag} <Ic name="x" size={12} width={2.6} />
            </button>
          )}
          {r && (
            <button aria-label="Clear dates" onClick={() => setRange(null)}>
              {dm(r.from)} – {dm(r.to)} <Ic name="x" size={12} width={2.6} />
            </button>
          )}
        </div>
      )}
    </>
  );
}

function useFiltered<T extends { tag: string }>(k: ListKey, items: T[], hay: (x: T) => string, date?: (x: T) => string) {
  const { ui } = useApp();
  const tag = ui.tag[k];
  const q = ui.q[k].trim().toLowerCase();
  const r = k === "threads" ? null : ui.range[k];
  return items.filter(
    (x) => (!tag || x.tag === tag) && (!q || hay(x).toLowerCase().includes(q)) && (!r || !date || (date(x) >= r.from && date(x) <= r.to)),
  );
}

/* ---------------------------------------------------------- shared pieces */

export function Datebox({ iso }: { iso: string }) {
  const t = parse(iso);
  return (
    <div className="datebox">
      <div className="dow">{DOW[t.getDay()].toUpperCase()}</div>
      <div className="dnum">{t.getDate()}</div>
      <div className="mon">{MON[t.getMonth()]}</div>
    </div>
  );
}

// Events without a photo borrow their thread's icon tile, as in the mockup.
export function Thumb({ e, cls }: { e: EventRow; cls: string }) {
  const { data } = useApp();
  const src = imageUrl(e.image);
  // eslint-disable-next-line @next/next/no-img-element -- thumbnails from storage or demo files
  if (src) return <img className={cls} src={src} alt="" />;
  const t = data.threads.find((x) => x.id === e.thread_id);
  return (
    <span className={`${cls} ph`} style={{ background: t?.color ?? "var(--ink-3)" }}>
      <Ic name={t?.icon ?? "users"} size={24} />
    </span>
  );
}

function ChatButton({ e, size }: { e: EventRow; size?: number }) {
  const { data, openChat } = useApp();
  const unread = data.chats.get(`event:${e.id}`)?.unread ?? 0;
  return (
    <button
      className="chatbtn"
      style={size ? { width: size, height: size } : undefined}
      aria-label="Open event chat"
      onClick={(ev) => {
        ev.stopPropagation();
        openChat({ type: "event", id: e.id });
      }}
    >
      <Ic name="chat" size={size ? 20 : 18} />
      {unread ? <span className="badge">{unread}</span> : null}
    </button>
  );
}
export { ChatButton };

export function ActionButtons({ e, compact }: { e: EventRow; compact?: boolean }) {
  const { isGoing, isFull, toggleJoin, openDetail, data } = useApp();
  const stop = (fn: () => void) => (ev: React.MouseEvent) => {
    ev.stopPropagation();
    fn();
  };
  if (isGoing(e.id))
    return (
      <>
        <ChatButton e={e} />
        {!compact && (
          <button className="btn on" onClick={stop(() => void toggleJoin(e))}>
            ✓ Going
          </button>
        )}
      </>
    );
  if (data.going.get(e.id)?.status === "waitlist")
    return (
      <button className="btn" onClick={stop(() => void toggleJoin(e))}>
        On waitlist
      </button>
    );
  if (isFull(e))
    return (
      <button className="btn" onClick={stop(() => void toggleJoin(e))}>
        Waitlist
      </button>
    );
  if (e.tickets.length)
    return (
      <button className="btn primary" onClick={stop(() => openDetail(e.id))}>
        Tickets
      </button>
    );
  return (
    <button className="btn primary" onClick={stop(() => void toggleJoin(e))}>
      Join
    </button>
  );
}

export function ERow({ e, showDate = true }: { e: EventRow; showDate?: boolean }) {
  const { openDetail } = useApp();
  return (
    <div className="erow" onClick={() => openDetail(e.id)}>
      <Thumb e={e} cls="eimg" />
      <div className="body">
        <span className="w">
          {showDate ? `${fmtShort(e.next_on)} · ` : ""}
          {to12h(e.starts_at)}
        </span>
        <span className="t">{e.title}</span>
        <span className="kind">
          <i className={`kdot ${e.kind}`} />
          {e.kind === "public" ? "Public" : "Community"} · {e.place}
        </span>
      </div>
      <ActionButtons e={e} compact />
    </div>
  );
}

const upcoming = (events: EventRow[], today: string) => events.filter((e) => e.next_on >= today);
const byDate = (a: EventRow, b: EventRow) => a.next_on.localeCompare(b.next_on) || a.starts_at.localeCompare(b.starts_at);
const hostName = (e: EventRow) => (e.kind === "public" ? (e.host?.venue_name ?? "") : nameOf(e.host));

/* ------------------------------------------------------------ public tab */

export function PublicView() {
  const { data, today, openDetail, me } = useApp();
  const items = useFiltered(
    "public",
    upcoming(data.events, today).filter((e) => e.kind === "public"),
    (e) => [e.title, e.place, e.tag, hostName(e)].join(" "),
    (e) => e.next_on,
  ).sort(byDate);
  return (
    <>
      <div className="tab-head">
        <h1>Public events</h1>
      </div>
      <Toolbar k="public" />
      <div className="list">
        {!items.length && <NoResults />}
        {items.map((e) => (
          <article key={e.id} className="card has-img" onClick={() => openDetail(e.id)}>
            <div className="banner" style={{ backgroundImage: `url(${imageUrl(e.image) ?? "/demo/p0.jpg"})` }}>
              <Datebox iso={e.next_on} />
            </div>
            <div className="card-top">
              <div className="card-main">
                <h3>{e.title}</h3>
                <div className="sub">
                  {e.place} · {to12h(e.starts_at)}
                </div>
              </div>
            </div>
            <div className="card-foot">
              <span className="price">{priceLabel(e.price || (e.tickets.length ? Math.min(...e.tickets.map((t) => t.price)) : 0))}</span>
              <span className="muted">· {e.going_count} going</span>
              <span className="spacer" />
              <ActionButtons e={e} />
            </div>
          </article>
        ))}
        {me.role === "user" && (
          <Link className="promo" href="/venue">
            Run a venue in Taipei? <b>List an event →</b>
          </Link>
        )}
      </div>
    </>
  );
}

/* --------------------------------------------------------- community tab */

export function CommunityView() {
  const { data, today, openDetail, isFull } = useApp();
  const items = useFiltered(
    "community",
    upcoming(data.events, today).filter((e) => e.kind === "community"),
    (e) => [e.title, e.place, e.tag, hostName(e)].join(" "),
    (e) => e.next_on,
  ).sort(byDate);
  return (
    <>
      <div className="tab-head">
        <h1>Community events</h1>
      </div>
      <Toolbar k="community" />
      <div className="list">
        {!items.length && <NoResults />}
        {items.map((e) => (
          <article key={e.id} className="card" onClick={() => openDetail(e.id)}>
            <div className="card-top">
              <Thumb e={e} cls="thumb" />
              <div className="card-main">
                <div className="when">
                  {fmtShort(e.next_on)} · {to12h(e.starts_at)}
                  {e.repeat !== "none" && ` · ${REPEAT_LABEL[e.repeat]}`}
                </div>
                <h3>{e.title}</h3>
                <div className="sub">{e.place}</div>
              </div>
            </div>
            <div className="card-foot">
              <span className="avatar" style={{ background: e.host?.color ?? "#8FC1E3" }} title={nameOf(e.host)}>
                {initials(nameOf(e.host))}
              </span>
              <span className="muted">{isFull(e) ? "Full" : goingText(e)}</span>
              <span className="spacer" />
              <ActionButtons e={e} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/* ----------------------------------------------------------- threads tab */

export function lastMsgText(c: ChatSummary | undefined, myId: string, events: EventRow[], itemTitle?: (id: string) => string | undefined) {
  if (!c || !c.last_at) return null;
  const who = c.last_user_id === myId ? "You" : (c.last_user ?? "Someone");
  let what: string;
  if (c.last_kind === "event") what = `posted an event · ${events.find((e) => e.id === c.last_ref_event)?.title ?? "an event"}`;
  else if (c.last_kind === "file") what = `shared ${c.last_file?.name ?? "a file"}`;
  else if (c.last_kind === "deadline") what = `added a deadline · ${(c.last_ref_item && itemTitle?.(c.last_ref_item)) ?? "a deadline"}`;
  else what = c.last_body ?? "";
  return (
    <>
      <b>{who}:</b> {what}
    </>
  );
}

function ThreadRow({ t, mode }: { t: Thread; mode: "mine" | "all" }) {
  const { data, me, openChat, toggleFollow } = useApp();
  const c = data.chats.get(`thread:${t.id}`);
  return (
    <button className="thread" onClick={() => openChat({ type: "thread", id: t.id })}>
      <span className="thread-icon" style={{ background: t.color }}>
        <Ic name={t.icon} size={22} />
      </span>
      <span className="thread-body">
        <span className="thread-name">{t.name}</span>
        <span className="preview">
          {mode === "mine"
            ? (lastMsgText(c, me.id, data.events) ?? "No messages yet. Say hi!")
            : `${t.members.toLocaleString("en-US")} members · ${t.active} active today`}
        </span>
      </span>
      {mode === "mine" ? (
        <div className="side">
          <span className="time">{chatTime(c?.last_at ?? null)}</span>
          {c?.unread ? <span className="badge">{c.unread}</span> : <span style={{ height: 20 }} />}
        </div>
      ) : (
        <span
          className={`follow${t.followed ? " on" : ""}`}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            void toggleFollow(t.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              void toggleFollow(t.id);
            }
          }}
        >
          {t.followed ? "Following" : "Follow"}
        </span>
      )}
    </button>
  );
}

export function ThreadsView() {
  const { data, ui, setUi } = useApp();
  const seg = ui.threadSeg;
  const followed = data.threads.filter((t) => t.followed);
  const unread = followed.filter((t) => data.chats.get(`thread:${t.id}`)?.unread).length;
  const explore = useFiltered("threads", data.threads, (t) => [t.name, t.tag].join(" ")).sort((a, b) => b.active - a.active || b.members - a.members);
  const mine = followed
    .slice()
    .sort((a, b) => {
      const ca = data.chats.get(`thread:${a.id}`);
      const cb = data.chats.get(`thread:${b.id}`);
      return Number(!!cb?.unread) - Number(!!ca?.unread) || (cb?.last_at ?? "").localeCompare(ca?.last_at ?? "");
    });

  return (
    <>
      <div className="tab-head">
        <h1>Threads</h1>
      </div>
      <div className="seg">
        <button className={seg === "mine" ? "active" : ""} onClick={() => setUi((u) => ({ ...u, threadSeg: "mine" }))}>
          My threads{unread ? <span className="badge">{unread}</span> : null}
        </button>
        <button className={seg === "explore" ? "active" : ""} onClick={() => setUi((u) => ({ ...u, threadSeg: "explore" }))}>
          Explore
        </button>
      </div>
      {seg === "explore" ? (
        <>
          <Toolbar k="threads" />
          <div className="list rows">
            <Link className="create-row" href="/new-thread">
              <Ic name="plus" size={18} width={2.4} />
              Start a thread
            </Link>
            {explore.length ? explore.map((t) => <ThreadRow key={t.id} t={t} mode="all" />) : <NoResults />}
          </div>
        </>
      ) : (
        <div className="list rows">
          {mine.length === 0 ? (
            <div className="empty">
              You don’t follow any communities yet.
              <br />
              Open <b>Explore</b> and tap <b>Follow</b> on the ones you like.
            </div>
          ) : (
            mine.map((t) => <ThreadRow key={t.id} t={t} mode="mine" />)
          )}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- my events */

export function MineView() {
  const { data, ui, setUi, today, isGoing } = useApp();
  const f = ui.mineFilter;
  const weekEnd = (() => {
    const t = parse(today);
    const d = new Date(t);
    d.setDate(t.getDate() + ((7 - t.getDay()) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const mine = upcoming(data.events, today)
    .filter((e) => (isGoing(e.id) || data.going.get(e.id)?.status === "waitlist") && (f === "all" || e.kind === f))
    .sort(byDate);
  const week = mine.filter((e) => e.next_on <= weekEnd);
  const later = mine.filter((e) => e.next_on > weekEnd);
  const empty = {
    all: <>You haven’t joined any events yet.</>,
    public: (
      <>
        No public events yet. Get tickets in the <b>Public</b> tab.
      </>
    ),
    community: (
      <>
        No community events yet. Tap <b>Join</b> in the <b>Community</b> tab.
      </>
    ),
  }[f];
  return (
    <>
      <div className="tab-head">
        <h1>My events</h1>
      </div>
      <div className="seg">
        {(
          [
            ["all", "All"],
            ["public", "Public"],
            ["community", "Community"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={f === k ? "active" : ""} onClick={() => setUi((u) => ({ ...u, mineFilter: k }))}>
            {l}
          </button>
        ))}
      </div>
      <div className="list rows">
        {mine.length === 0 ? (
          <div className="empty">
            {empty}
            <br />
            Joined events and their group chats show up here.
          </div>
        ) : (
          <>
            {week.length > 0 && (
              <>
                <div className="section-label">This week</div>
                {week.map((e) => (
                  <ERow key={e.id} e={e} />
                ))}
              </>
            )}
            {later.length > 0 && (
              <>
                <div className="section-label">Later</div>
                {later.map((e) => (
                  <ERow key={e.id} e={e} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

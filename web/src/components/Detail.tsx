"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { ShareButton } from "@/components/views/Lists";
import { Ic } from "@/components/Icons";
import { REPEAT_LABEL, goingText, fmtLong, fmtShort, imageUrl, initials, to12h } from "@/lib/format";
import { nameOf, type PersonLite } from "@/lib/types";

type Attendee = { user_id: string; status: string; person: PersonLite | null };

export function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, me, isGoing, isFull, toggleJoin, openChat, toast, confirm, isPending } = useApp();
  const joining = isPending(`join:${id}`);
  const e = data.events.find((x) => x.id === id);
  const [ticket, setTicket] = useState({ tier: 0, qty: 1 });
  const [people, setPeople] = useState<Attendee[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!e || e.kind !== "community") return;
    let cancelled = false;
    void data.supabase
      .from("going")
      .select("user_id, status, person:profiles!going_user_id_fkey(id, username, display_name, color, tag, venue_name, role)")
      .eq("event_id", e.id)
      .eq("status", "going")
      .order("created_at")
      .then(({ data: rows }) => {
        if (!cancelled) setPeople((rows ?? []) as unknown as Attendee[]);
      });
    return () => {
      cancelled = true;
    };
  }, [data.supabase, e, data.going]);

  if (!e) return null;
  const on = isGoing(e.id);
  const pub = e.kind === "public";
  const mine = data.going.get(e.id);
  const thread = data.threads.find((t) => t.id === e.thread_id);
  const src = imageUrl(e.image);
  const host = e.host;

  async function buy() {
    if (!e) return;
    const t = e.tickets[ticket.tier];
    const ok = await confirm({
      title: "Book this ticket?",
      body: `${ticket.qty} × ${t?.name} for “${e.title}”, NT$${((t?.price ?? 0) * ticket.qty).toLocaleString("en-US")} paid at the door. The venue keeps a spot for you, so cancel here if you can’t make it 🙏`,
      ok: "Book",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await data.supabase.from("going").insert({ event_id: e.id, tier: ticket.tier, qty: ticket.qty });
    setBusy(false);
    if (error) return toast(`Couldn’t book: ${error.message}`);
    toast("Ticket booked · no payment needed in this version");
    await Promise.all([data.loadGoing(), data.loadEvents(), data.loadChats()]);
  }

  async function remove() {
    if (!e) return;
    const ok = await confirm({
      title: "Delete this event?",
      body: `“${e.title}” and its group chat will be gone for everyone. Everyone who joined or asked to join gets a notification that it’s cancelled.`,
      ok: "Delete event",
      danger: true,
    });
    if (!ok) return;
    const { error } = await data.supabase.from("events").delete().eq("id", e.id);
    if (error) return toast(`Couldn’t delete: ${error.message}`);
    toast("Event deleted");
    onClose();
    await data.loadEvents();
  }

  const unread = data.chats.get(`event:${e.id}`)?.unread ?? 0;
  const chatBtn = on ? (
    <button className="btn lg chat-pill" onClick={() => openChat({ type: "event", id: e.id })}>
      <Ic name="chat" size={18} />
      Chat
      {unread ? <span className="badge">{unread}</span> : null}
    </button>
  ) : null;
  let section: React.ReactNode = null;
  let bar: React.ReactNode = null;

  if (pub) {
    if (!e.tickets.length) {
      section = (
        <div className="dsec">
          <h4>Entry</h4>
          <div className="ticket-ok">
            <Ic name="check" size={18} width={2.4} />
            <span>
              <b>{e.price === 0 ? "Free entry." : `NT$${e.price.toLocaleString("en-US")} at the door.`}</b> No ticket needed, just show up.
            </span>
          </div>
        </div>
      );
      bar = (
        <>
          <span className="total">
            {e.price === 0 ? "Free" : `NT$${e.price.toLocaleString("en-US")}`}
            <b>{e.going_count} going</b>
          </span>
          {chatBtn}
          <button className={`btn lg ${on ? "on" : "primary"}`} disabled={joining} aria-busy={joining} onClick={() => void toggleJoin(e)}>
            {joining && <span className="spinner" aria-hidden />}
            {joining ? (on ? "Leaving…" : "Joining…") : on ? "✓ Going" : "Join"}
          </button>
        </>
      );
    } else if (mine && mine.tier !== null) {
      const t = e.tickets[mine.tier];
      const code = `SQ-${e.id.slice(0, 4).toUpperCase()}-${mine.created_at.replace(/\D/g, "").slice(-4)}`;
      section = (
        <div className="dsec">
          <h4>Your tickets</h4>
          <div className="ticket-ok">
            <Ic name="ticket" size={18} />
            <span>
              <b>
                {mine.qty} × {t?.name}
              </b>{" "}
              · NT${((t?.price ?? 0) * mine.qty).toLocaleString("en-US")}
              <br />
              Pay at the door and show this booking: {code}.
            </span>
          </div>
        </div>
      );
      bar = (
        <>
          <span className="total">
            Ticket booked<b>{e.going_count} going</b>
          </span>
          {chatBtn}
          <button className="btn lg on" onClick={() => void toggleJoin(e)}>
            ✓ Going
          </button>
        </>
      );
    } else {
      const price = e.tickets[ticket.tier]?.price ?? 0;
      section = (
        <div className="dsec">
          <h4>Tickets</h4>
          {e.tickets.map((t, i) => (
            <button key={i} className={`tier${i === ticket.tier ? " sel" : ""}`} onClick={() => setTicket((s) => ({ ...s, tier: i }))}>
              <span className="radio" />
              <span className="tn">
                {t.name}
                {t.note ? <small>{t.note}</small> : null}
              </span>
              <span className="tp">NT${t.price.toLocaleString("en-US")}</span>
            </button>
          ))}
          <div className="qty">
            Quantity
            <div className="stepper">
              <button aria-label="One less" disabled={ticket.qty <= 1} onClick={() => setTicket((s) => ({ ...s, qty: s.qty - 1 }))}>
                <Ic name="minus" size={16} width={2.4} />
              </button>
              <b>{ticket.qty}</b>
              <button aria-label="One more" disabled={ticket.qty >= 6} onClick={() => setTicket((s) => ({ ...s, qty: s.qty + 1 }))}>
                <Ic name="plus" size={16} width={2.4} />
              </button>
            </div>
          </div>
        </div>
      );
      bar = (
        <>
          <span className="total">
            Total<b>NT${(price * ticket.qty).toLocaleString("en-US")}</b>
          </span>
          {chatBtn}
          <button className="btn lg primary" disabled={busy || e.host_id === me.id} aria-busy={busy} onClick={() => void buy()}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Booking…" : `Book ${ticket.qty > 1 ? `${ticket.qty} tickets` : "ticket"}`}
          </button>
        </>
      );
    }
  } else {
    const full = isFull(e);
    const max = e.max_going;
    const count = max === null ? e.going_count + 1 : Math.min(e.going_count + 1, max);
    const list: { name: string; tag: string; color: string; role: "host" | "me" | "" }[] = [
      { name: nameOf(host), tag: host?.tag ?? "", color: host?.color ?? "#8FC1E3", role: host?.id === me.id ? "me" : "host" },
      ...people
        .filter((p) => p.user_id !== e.host_id)
        .map((p) => ({
          name: p.user_id === me.id ? "You" : nameOf(p.person),
          tag: p.person?.tag ?? "",
          color: p.person?.color ?? "#8FC1E3",
          role: (p.user_id === me.id ? "me" : "") as "me" | "",
        })),
    ];
    section = (
      <div className="going-card">
        <h4 className="going-title">Who’s going · {goingText(e).replace(" going", "")}</h4>
        {/* Folded: three faces and the arrow on one line. Open: everyone,
            the host first. */}
        <button className="going-row" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} aria-label={showAll ? "Hide who’s going" : "Show who’s going"}>
          <span className="faces">
            {list.slice(0, 3).map((p, i) => (
              <span key={i} className="avatar" style={{ background: p.role === "me" ? "var(--accent)" : p.color }}>
                {p.role === "me" ? "ME" : initials(p.name)}
              </span>
            ))}
            {list.length > 3 && <span className="faces-more">+{list.length - 3}</span>}
          </span>
          <span className={`chev${showAll ? " up" : ""}`} aria-hidden>
            <Ic name="back" size={18} width={2.6} />
          </span>
        </button>
        <div className={`fold${showAll ? " open" : ""}`}>
          <div className="fold-inner">
            {list.map((p, i) => (
              <Person key={i} p={p} host={i === 0} />
            ))}
          </div>
        </div>
      </div>
    );
    const left = max === null ? "Unlimited" : max - count;
    const waiting = mine?.status === "waitlist";
    const asked = mine?.status === "requested";
    bar = (
      <>
        <span className="total">
          {full ? "Event is full" : "Spots left"}
          <b>{full ? "Waitlist open" : left}</b>
        </span>
        {chatBtn}
        <button className={`btn lg ${on ? "on" : full || waiting || asked ? "" : "primary"}`} disabled={joining} aria-busy={joining} onClick={() => void toggleJoin(e)}>
          {joining && <span className="spinner" aria-hidden />}
          {joining
            ? on || waiting || asked
              ? "Leaving…"
              : "Joining…"
            : e.host_id === me.id
            ? "You’re hosting"
            : on
              ? "✓ Going"
              : asked
                ? "Requested · cancel"
                : waiting
                  ? "On waitlist · leave"
                  : e.join_mode === "approval"
                    ? "Ask to join"
                    : full
                      ? "Join waitlist"
                      : "Join"}
        </button>
      </>
    );
  }

  const organizer = pub ? (
    <div className="info-row">
      <span className="info-ic verified">
        <Ic name="shield" size={18} />
      </span>
      <span>
        {host?.venue_name ?? e.place.split(" · ")[0]}
        <small>Verified organizer</small>
      </span>
    </div>
  ) : (
    <div className="info-row">
      <span className="avatar" style={{ width: 36, height: 36, background: host?.color ?? "#8FC1E3" }}>
        {initials(nameOf(host))}
      </span>
      <span>
        {nameOf(host)}
        <small>Host{host?.tag ? ` · ${host.tag}` : ""}</small>
      </span>
    </div>
  );

  return (
    <>
      <div className="dscroll">
        {src ? (
          <div className="hero" style={{ backgroundImage: `url(${src})` }}>
            <button className="hero-back" aria-label="Back" onClick={onClose}>
              <Ic name="back" size={22} width={2.2} />
            </button>
            {/* Top right of the photo: share, and for the host edit / delete. */}
            <div className="hero-actions">
              {e.host_id === me.id && (
                <a className="hero-btn" href={`/new-event?edit=${e.id}`} aria-label="Edit event" title="Edit event">
                  <Ic name="pen" size={20} width={2.2} />
                </a>
              )}
              {(e.host_id === me.id || me.role === "admin") && (
                <button className="hero-btn danger" aria-label="Delete event" title="Delete event" onClick={() => void remove()}>
                  <Ic name="trash" size={20} width={2.2} />
                </button>
              )}
              <ShareButton e={e} className="hero-btn" size={22} />
            </div>
          </div>
        ) : (
          <div className="hero ph" style={{ background: thread?.color ?? "var(--ink-3)" }}>
            <Ic name={thread?.icon ?? "users"} size={72} width={1.6} />
            <button className="hero-back" aria-label="Back" onClick={onClose}>
              <Ic name="back" size={22} width={2.2} />
            </button>
            {/* Top right of the photo: share, and for the host edit / delete. */}
            <div className="hero-actions">
              {e.host_id === me.id && (
                <a className="hero-btn" href={`/new-event?edit=${e.id}`} aria-label="Edit event" title="Edit event">
                  <Ic name="pen" size={20} width={2.2} />
                </a>
              )}
              {(e.host_id === me.id || me.role === "admin") && (
                <button className="hero-btn danger" aria-label="Delete event" title="Delete event" onClick={() => void remove()}>
                  <Ic name="trash" size={20} width={2.2} />
                </button>
              )}
              <ShareButton e={e} className="hero-btn" size={22} />
            </div>
          </div>
        )}
        <div className="dbody">
          <div className="dhead">
            <span className="dtag">
              {pub ? "Public event" : e.join_mode === "approval" ? "Private community event" : "Community event"} · {e.tag}
            </span>
            <h2>{e.title}</h2>
          </div>
          <div className="info">
            <div className="info-row">
              <span className="info-ic">
                <Ic name="clock" size={18} />
              </span>
              <span>
                {fmtLong(e.next_on)}
                <small>
                  {to12h(e.starts_at)}
                  {e.repeat !== "none" && ` · ${REPEAT_LABEL[e.repeat]}${e.repeat_until ? ` until ${fmtShort(e.repeat_until)}` : ""}`}
                </small>
              </span>
            </div>
            <div className="info-row">
              <span className="info-ic">
                <Ic name="mappin" size={18} />
              </span>
              <span>
                {e.place}
                <small>Taipei</small>
              </span>
            </div>
            {organizer}
            {thread && (
              <button className="info-row" style={{ textAlign: "left" }} onClick={() => openChat({ type: "thread", id: thread.id })}>
                <span className="thread-icon" style={{ width: 36, height: 36, borderRadius: 10, background: thread.color }}>
                  <Ic name={thread.icon} size={18} />
                </span>
                <span>
                  {thread.name}
                  <small>Created in this thread · open chat</small>
                </span>
              </button>
            )}
          </div>
          {e.description && <p>{e.description}</p>}
          {e.host_id === me.id && e.join_mode === "approval" && <Requests eventId={e.id} />}
          {section}

        </div>
      </div>
      <div className="dbar">{bar}</div>
    </>
  );
}

function Person({ p, host }: { p: { name: string; tag: string; color: string; role: string }; host?: boolean }) {
  return (
    <div className="person">
      <span className="avatar" style={{ width: 36, height: 36, background: p.role === "me" ? "var(--accent)" : p.color }}>
        {p.role === "me" ? "ME" : initials(p.name)}
      </span>
      <span className="n">
        {p.name}
        {p.tag ? <small>{p.tag}</small> : null}
      </span>
      {host ? <span className="host-pill">Host</span> : null}
    </div>
  );
}

// The host's list of people asking to join, with yes / no.
function Requests({ eventId }: { eventId: string }) {
  const { data, toast } = useApp();
  const [rows, setRows] = useState<{ user_id: string; person: PersonLite | null }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const count = data.requests.get(eventId) ?? 0;

  useEffect(() => {
    let cancelled = false;
    void data.supabase
      .from("going")
      .select("user_id, person:profiles!going_user_id_fkey(id, username, display_name, color, tag, venue_name, role)")
      .eq("event_id", eventId)
      .eq("status", "requested")
      .order("created_at")
      .then(({ data: r }) => {
        if (!cancelled) setRows((r ?? []) as unknown as typeof rows);
      });
    return () => {
      cancelled = true;
    };
  }, [data.supabase, eventId, count]);

  async function answer(userId: string, approve: boolean) {
    setBusy(userId);
    const { data: status, error } = await data.supabase.rpc("answer_join_request", { p_event: eventId, p_user: userId, p_approve: approve });
    setBusy(null);
    if (error) return toast(error.message);
    toast(!approve ? "Request declined" : status === "waitlist" ? "Approved · on the waitlist, the event is full" : "Approved · they’re in");
    await Promise.all([data.loadRequests(), data.loadEvents()]);
  }

  return (
    <div className="going-card">
      <h4 className="going-title">Asking to join · {rows.length}</h4>
      {rows.length === 0 && <div className="hint" style={{ paddingTop: 8 }}>No requests right now.</div>}
      {rows.map((r) => (
        <div key={r.user_id} className="person">
          <span className="avatar" style={{ width: 36, height: 36, background: r.person?.color ?? "#8FC1E3" }}>
            {initials(nameOf(r.person))}
          </span>
          <span className="n">
            {nameOf(r.person)}
            {r.person?.tag ? <small>{r.person.tag}</small> : null}
          </span>
          <button className="btn primary" disabled={busy === r.user_id} onClick={() => void answer(r.user_id, true)}>
            Approve
          </button>
          <button className="btn" disabled={busy === r.user_id} onClick={() => void answer(r.user_id, false)}>
            Decline
          </button>
        </div>
      ))}
    </div>
  );
}

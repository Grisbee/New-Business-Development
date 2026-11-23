"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppShell";
import { ChatButton } from "@/components/views/Lists";
import { Ic } from "@/components/Icons";
import { REPEAT_LABEL, goingText, fmtLong, fmtShort, imageUrl, initials, to12h } from "@/lib/format";
import { nameOf, type PersonLite } from "@/lib/types";

type Attendee = { user_id: string; status: string; person: PersonLite | null };

export function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, me, isGoing, isFull, toggleJoin, openChat, toast, confirm } = useApp();
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
      body: `${ticket.qty} × ${t?.name} for “${e.title}”, NT$${((t?.price ?? 0) * ticket.qty).toLocaleString("en-US")} paid at the door.`,
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
    const ok = await confirm({ title: "Delete this event?", body: `“${e.title}” and its group chat will be gone for everyone.`, ok: "Delete", danger: true });
    if (!ok) return;
    const { error } = await data.supabase.from("events").delete().eq("id", e.id);
    if (error) return toast(`Couldn’t delete: ${error.message}`);
    toast("Event deleted");
    onClose();
    await data.loadEvents();
  }

  const chatBtn = on ? <ChatButton e={e} size={46} /> : null;
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
          <button className={`btn lg ${on ? "on" : "primary"}`} onClick={() => void toggleJoin(e)}>
            {on ? "✓ Going" : "Join"}
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
          <button className="btn lg primary" disabled={busy || e.host_id === me.id} onClick={() => void buy()}>
            Book {ticket.qty > 1 ? `${ticket.qty} tickets` : "ticket"}
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
    const seedOthers = e.going_count - people.filter((p) => p.user_id !== e.host_id).length;
    // Faces past the first six, plus people counted but not listed (demo data).
    const hiddenCount = Math.max(0, list.length - 7) + Math.max(0, seedOthers);
    section = (
      <div className="dsec">
        <button className="going-head" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          <h4>Who’s going · {goingText(e).replace(" going", "")}</h4>
          <span className={`chev${showAll ? " up" : ""}`} aria-hidden>
            <Ic name="back" size={16} width={2.4} />
          </span>
        </button>
        {/* The host is always shown; the rest fold into a row of faces. */}
        {(showAll ? list : list.slice(0, 1)).map((p, i) => (
          <div key={i} className="person">
            <span className="avatar" style={{ width: 36, height: 36, background: p.role === "me" ? "var(--accent)" : p.color }}>
              {p.role === "me" ? "ME" : initials(p.name)}
            </span>
            <span className="n">
              {p.name}
              {p.tag ? <small>{p.tag}</small> : null}
            </span>
            {i === 0 ? <span className="host-pill">Host</span> : null}
          </div>
        ))}
        {!showAll && (list.length > 1 || hiddenCount > 0) && (
          <button className="faces" onClick={() => setShowAll(true)} aria-label="Show everyone going">
            {list.slice(1, 7).map((p, i) => (
              <span key={i} className="avatar" style={{ background: p.role === "me" ? "var(--accent)" : p.color }}>
                {p.role === "me" ? "ME" : initials(p.name)}
              </span>
            ))}
            {hiddenCount > 0 && <span className="faces-more">+{hiddenCount}</span>}
          </button>
        )}
        {showAll && seedOthers > 0 && <div className="hint">and {seedOthers} more</div>}
      </div>
    );
    const left = max === null ? "Unlimited" : max - count;
    const waiting = mine?.status === "waitlist";
    bar = (
      <>
        <span className="total">
          {full ? "Event is full" : "Spots left"}
          <b>{full ? "Waitlist open" : left}</b>
        </span>
        {chatBtn}
        <button className={`btn lg ${on ? "on" : full || waiting ? "" : "primary"}`} onClick={() => void toggleJoin(e)}>
          {e.host_id === me.id ? "You’re hosting" : on ? "✓ Going" : waiting ? "On waitlist · leave" : full ? "Join waitlist" : "Join"}
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
          </div>
        ) : (
          <div className="hero ph" style={{ background: thread?.color ?? "var(--ink-3)" }}>
            <Ic name={thread?.icon ?? "users"} size={72} width={1.6} />
            <button className="hero-back" aria-label="Back" onClick={onClose}>
              <Ic name="back" size={22} width={2.2} />
            </button>
          </div>
        )}
        <div className="dbody">
          <div className="dhead">
            <span className="dtag">
              {pub ? "Public event" : "Community event"} · {e.tag}
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
          {section}
          {(e.host_id === me.id || me.role === "admin") && (
            <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => void remove()}>
              Delete event
            </button>
          )}
        </div>
      </div>
      <div className="dbar">{bar}</div>
    </>
  );
}

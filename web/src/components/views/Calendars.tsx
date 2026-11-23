"use client";

import { useState } from "react";
import { useApp } from "@/components/AppShell";
import { ERow, lastMsgText } from "@/components/views/Lists";
import { Ic } from "@/components/Icons";
import { DAYS, MON, MONTHS, chatTime, dueIn, fmtShort, isoOf, occurrences, parse, to12h } from "@/lib/format";
import type { UniItem } from "@/lib/types";

const KIND_LABEL = { deadline: "Deadline", exam: "Exam", other: "Other" } as const;

// Five or six Monday-first weeks covering the month of `month` (YYYY-MM-01).
function monthCells(month: string) {
  const first = parse(month);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells: { iso: string; day: number; out: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    cells.push({ iso: isoOf(d), day: d.getDate(), out: d.getMonth() !== first.getMonth() });
  }
  return cells;
}

function MonthGrid({
  selected,
  onSelect,
  dots,
  legend,
}: {
  selected: string;
  onSelect: (iso: string) => void;
  // `star`: an event you're going to, drawn as a little star.
  dots: (iso: string) => { cls: string; star?: boolean }[];
  legend: React.ReactNode;
}) {
  const { today } = useApp();
  const [month, setMonth] = useState(() => `${selected.slice(0, 7)}-01`);
  // Which way the month slides in.
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  const m = parse(month);
  const shift = (n: number) => {
    const d = new Date(m.getFullYear(), m.getMonth() + n, 1);
    setDir(n > 0 ? "next" : "prev");
    setMonth(isoOf(d));
  };
  return (
    <div className="cal">
      <div className="cal-head">
        <b style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Previous month" onClick={() => shift(-1)}>
            <Ic name="back" size={16} width={2.4} />
          </button>
          {MONTHS[m.getMonth()]} {m.getFullYear()}
          <button className="icon-btn" style={{ width: 28, height: 28, transform: "scaleX(-1)" }} aria-label="Next month" onClick={() => shift(1)}>
            <Ic name="back" size={16} width={2.4} />
          </button>
        </b>
      </div>
      <div className="legend cal-legend">{legend}</div>
      <div className="cal-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="cal-dow">
            {d}
          </div>
        ))}
      </div>
      <div key={month} className={`cal-grid${dir ? ` cal-slide-${dir}` : ""}`}>
        {monthCells(month).map((c) => {
          const ds = dots(c.iso);
          return (
            <button
              key={c.iso}
              className={`day${c.out ? " out" : ""}${c.iso === today ? " today" : ""}${c.iso === selected ? " sel" : ""}`}
              aria-label={`${fmtShort(c.iso)}, ${ds.length} items`}
              onClick={() => onSelect(c.iso)}
            >
              {c.day}
              <span className="dots">
                {ds.slice(0, 3).map((d, i) =>
                  d.star ? (
                    <svg key={i} className={`dot-star ${d.cls}`} viewBox="0 0 24 24" aria-hidden>
                      <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
                    </svg>
                  ) : (
                    <i key={i} className={d.cls} />
                  ),
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const dayHead = (iso: string) => {
  const d = parse(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
};

/* ---------------------------------------------------------- city calendar */

export function CalendarView() {
  const { data, ui, setUi, isGoing } = useApp();
  const sorted = data.events.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const on = (e: (typeof sorted)[number], iso: string) => occurrences(e, iso, iso).length > 0;
  const dayEvents = sorted.filter((e) => on(e, ui.calDay));
  return (
    <>
      <div className="tab-head">
        <h1>Calendar</h1>
      </div>
      <MonthGrid
        selected={ui.calDay}
        onSelect={(iso) => setUi((u) => ({ ...u, calDay: iso }))}
        dots={(iso) => sorted.filter((e) => on(e, iso)).map((e) => ({ cls: e.kind, star: isGoing(e.id) }))}
        legend={
          <>
            <span>
              <i className="kdot public" />
              Public
            </span>
            <span>
              <i className="kdot community" />
              Community
            </span>
            <span>
              <svg className="dot-star legend-star" viewBox="0 0 24 24" aria-hidden>
                <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
              </svg>
              Going
            </span>
          </>
        }
      />
      <div className="list" style={{ gap: 0 }}>
        <div className="dayhead">{dayHead(ui.calDay)}</div>
        {dayEvents.length ? (
          dayEvents.map((e) => <ERow key={e.id} e={e} showDate={false} />)
        ) : (
          <div className="empty" style={{ padding: "24px 0" }}>
            Nothing planned this day yet.
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------- university mode */

export function UniRow({ x }: { x: UniItem }) {
  const { data, openChat, today } = useApp();
  const t = x.team_id ? data.teams.find((tm) => tm.id === x.team_id) : null;
  return (
    <div
      className={`urow ${x.kind}`}
      data-team={t ? t.id : undefined}
      onClick={t ? () => openChat({ type: "team", id: t.id }, "deadlines") : undefined}
    >
      <span className="ukind">
        <Ic name={x.kind === "exam" ? "pen" : x.kind === "deadline" ? "flag" : "clock"} size={18} />
      </span>
      <div className="body">
        <span className="w">
          {KIND_LABEL[x.kind]} · {to12h(x.due_at)}
        </span>
        <span className="t">{x.title}</span>
        <span className="kind">
          {x.course} · {t ? t.name : (x.place ?? "Personal")}
        </span>
      </div>
      <span className="countdown">{dueIn(x.due_on, today)}</span>
    </div>
  );
}

export function TeamsView() {
  const { data, me, openChat, openSheet, today } = useApp();
  const itemTitle = (id: string) => data.items.find((x) => x.id === id)?.title;
  return (
    <>
      <div className="tab-head">
        <h1>Teams</h1>
      </div>
      <div className="list rows" style={{ paddingTop: 10 }}>
        <button className="create-row" onClick={() => openSheet({ kind: "team" })}>
          <Ic name="plus" size={18} width={2.4} />
          Create or join a team
        </button>
        {data.teams.length === 0 && (
          <div className="empty">
            No teams yet.
            <br />
            Create one for a course project, or join with a code from a classmate.
          </div>
        )}
        {data.teams.map((t) => {
          const c = data.chats.get(`team:${t.id}`);
          const next = data.items.filter((x) => x.team_id === t.id && x.due_on >= today)[0];
          return (
            <button key={t.id} className="thread" onClick={() => openChat({ type: "team", id: t.id })}>
              <span className="thread-icon" style={{ background: t.color }}>
                <Ic name={t.icon} size={22} />
              </span>
              <span className="thread-body">
                <span className="thread-name">{t.name}</span>
                <span className="preview">{lastMsgText(c, me.id, data.events, itemTitle) ?? `${t.course_code} · ${t.member_count} members`}</span>
                {next && (
                  <span className="due">
                    <Ic name="flag" size={12} width={2.2} />
                    {next.title} · {dueIn(next.due_on, today)}
                  </span>
                )}
              </span>
              <div className="side">
                <span className="time">{chatTime(c?.last_at ?? null)}</span>
                {c?.unread ? <span className="badge">{c.unread}</span> : <span style={{ height: 20 }} />}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function UniCalendarView() {
  const { data, ui, setUi } = useApp();
  const dayItems = data.items.filter((x) => x.due_on === ui.uniDay);
  return (
    <>
      <div className="tab-head">
        <h1>Calendar</h1>
      </div>
      <MonthGrid
        selected={ui.uniDay}
        onSelect={(iso) => setUi((u) => ({ ...u, uniDay: iso }))}
        dots={(iso) => data.items.filter((x) => x.due_on === iso).map((x) => ({ cls: x.kind }))}
        legend={
          <>
            <span>
              <i className="kdot deadline" />
              Deadline
            </span>
            <span>
              <i className="kdot exam" />
              Exam
            </span>
            <span>
              <i className="kdot other" />
              Other
            </span>
          </>
        }
      />
      <div className="list" style={{ gap: 0 }}>
        <div className="dayhead">{dayHead(ui.uniDay)}</div>
        {dayItems.length ? (
          dayItems.map((x) => <UniRow key={x.id} x={x} />)
        ) : (
          <div className="empty" style={{ padding: "24px 0" }}>
            Nothing due this day.
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppShell";
import { ERow, Thumb, openable } from "@/components/views/Lists";
import { UniRow } from "@/components/views/Calendars";
import { Ic } from "@/components/Icons";
import { resizeImage } from "@/lib/resizeImage";
import { Missing } from "@/components/Missing";
import { USER_COLORS, goingText, chatTime, dueIn, fmtShort, initials, to12h } from "@/lib/format";
import { nameOf, type ChatRef, type FileInfo, type Message } from "@/lib/types";

const MSG_SELECT = "id, thread_id, event_id, team_id, user_id, kind, body, ref_event, ref_item, file, created_at, author:profiles!messages_user_id_fkey(username, display_name, color)";

const colorFor = (n: string) => USER_COLORS[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % USER_COLORS.length];
const column = (t: ChatRef["type"]) => (t === "thread" ? "thread_id" : t === "event" ? "event_id" : "team_id");

export function ChatPanel({ chatRef, initialTab, onClose }: { chatRef: ChatRef; initialTab: string; onClose: () => void }) {
  const { data, me, toast, toggleFollow, openSheet, isPending, today } = useApp();
  const [msgs, setMsgs] = useState<Message[]>([]);
  // Signed links for the photos in this chat (the bucket is private).
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [text, setText] = useState("");
  const msgsRef = useRef<HTMLDivElement>(null);
  const col = column(chatRef.type);
  // Following a thread unlocks its chat: load the messages again then.
  const followed = chatRef.type === "thread" ? data.threads.find((x) => x.id === chatRef.id)?.followed : true;

  // Signs links only for photos not signed yet, so they aren't re-downloaded.
  const signed = useRef(new Set<string>());
  const signPhotos = useCallback(
    async (list: Message[]) => {
      const paths = list.filter((m) => m.kind === "image" && m.file && !signed.current.has(m.file.path)).map((m) => m.file!.path);
      if (!paths.length) return;
      paths.forEach((p) => signed.current.add(p));
      const { data: urls } = await data.supabase.storage.from("chat-images").createSignedUrls(paths, 3600);
      setPhotoUrls((prev) => {
        const next = new Map(prev);
        (urls ?? []).forEach((x) => x.path && x.signedUrl && next.set(x.path, x.signedUrl));
        return next;
      });
    },
    [data.supabase],
  );

  const load = useCallback(async () => {
    const { data: rows, error } = await data.supabase
      .from("messages")
      .select(MSG_SELECT)
      .eq(col, chatRef.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return toast(`Couldn’t load the chat: ${error.message}`);
    const list = ((rows ?? []) as unknown as Message[]).reverse();
    setMsgs(list);
    await signPhotos(list);
  }, [data.supabase, col, chatRef.id, toast, signPhotos]);

  // Adds one message (from sending or realtime) unless it's already there.
  const append = useCallback(
    (m: Message) => {
      setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      void signPhotos([m]);
    },
    [signPhotos],
  );

  const lastRead = useRef(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the chat on open
    void load();
    const channel = data.supabase
      // A unique topic: a channel still leaving can't be handed back.
      .channel(`chat:${chatRef.type}:${chatRef.id}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `${col}=eq.${chatRef.id}` }, (payload) => {
        const id = (payload.new as { id: number }).id;
        void data.supabase
          .from("messages")
          .select(MSG_SELECT)
          .eq("id", id)
          .maybeSingle()
          .then(({ data: row }) => row && append(row as unknown as Message));
        // Read marker at most every 5 s while the chat is open.
        if (Date.now() - lastRead.current > 5000) {
          lastRead.current = Date.now();
          void data.supabase.rpc("mark_read", { p_chat_key: `${chatRef.type}:${chatRef.id}` });
        }
      })
      .subscribe();
    return () => {
      void data.supabase.removeChannel(channel);
      // And once on close, so the badge clears.
      void data.supabase.rpc("mark_read", { p_chat_key: `${chatRef.type}:${chatRef.id}` });
    };
  }, [data.supabase, chatRef.type, chatRef.id, col, load, append]);

  // Following a thread unlocks its chat: load it again, same channel.
  const firstFollow = useRef(followed);
  useEffect(() => {
    if (firstFollow.current === followed) return;
    firstFollow.current = followed;
    void load();
  }, [followed, load]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [msgs, tab]);

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data: row, error } = await data.supabase.from("messages").insert({ [col]: chatRef.id, kind: "text", body }).select(MSG_SELECT).single();
    if (error) {
      setText(body);
      return toast(`Not sent: ${error.message}`);
    }
    append(row as unknown as Message);
  }

  async function attach(file: File) {
    if (file.size > 20 * 1024 * 1024) return toast("Files up to 20 MB");
    const ext = (file.name.split(".").pop() || "file").toLowerCase().slice(0, 4);
    const path = `${chatRef.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await data.supabase.storage.from("team-files").upload(path, file);
    if (up.error) return toast(`Upload failed: ${up.error.message}`);
    const size = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    const { data: row, error } = await data.supabase
      .from("messages")
      .insert({ team_id: chatRef.id, kind: "file", file: { name: file.name, ext, size, path } satisfies FileInfo })
      .select(MSG_SELECT)
      .single();
    if (error) return toast(`Not shared: ${error.message}`);
    toast("File shared with the team");
    append(row as unknown as Message);
  }

  async function sendPhoto(original: File) {
    if (!original.type.startsWith("image/")) return toast("Pick a photo");
    setSendingPhoto(true);
    const file = await resizeImage(original, 1280);
    if (file.size > 10 * 1024 * 1024) {
      setSendingPhoto(false);
      return toast("Photos up to 10 MB");
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 4);
    const path = `${chatRef.type}/${chatRef.id}/${crypto.randomUUID()}.${ext}`;
    const up = await data.supabase.storage.from("chat-images").upload(path, file, { contentType: file.type });
    if (up.error) {
      setSendingPhoto(false);
      return toast(`Upload failed: ${up.error.message}`);
    }
    const size = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    const { data: row, error } = await data.supabase
      .from("messages")
      .insert({ [col]: chatRef.id, kind: "image", file: { name: file.name, ext, size, path } })
      .select(MSG_SELECT)
      .single();
    setSendingPhoto(false);
    if (error) return toast(`Not sent: ${error.message}`);
    append(row as unknown as Message);
  }

  async function openFile(f: FileInfo) {
    const { data: signed, error } = await data.supabase.storage.from("team-files").createSignedUrl(f.path, 300);
    if (error || !signed) return toast("Couldn’t open the file");
    window.open(signed.signedUrl, "_blank", "noopener");
  }

  let head: React.ReactNode;
  let extra: React.ReactNode = null;
  let body: React.ReactNode;
  let foot: React.ReactNode = null;
  const bubbles = (
    <Bubbles
      msgs={msgs}
      photoUrls={photoUrls}
      hostId={chatRef.type === "event" ? data.events.find((e) => e.id === chatRef.id)?.host_id : undefined}
      onFile={openFile}
    />
  );
  const photoBtn = (
    <label className={`plusbtn${sendingPhoto ? " busy" : ""}`} aria-label="Send a photo" style={{ cursor: "pointer" }}>
      {sendingPhoto ? <span className="spinner" style={{ margin: 0 }} aria-hidden /> : <Ic name="camera" size={19} />}
      <input
        type="file"
        accept="image/*"
        hidden
        disabled={sendingPhoto}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void sendPhoto(f);
        }}
      />
    </label>
  );
  const msgList = (
    <div className="msgs" id="msgs" ref={msgsRef}>
      {msgs.length === 0 ? <div className="daysep">NO MESSAGES YET</div> : bubbles}
    </div>
  );

  if (chatRef.type === "thread") {
    const t = data.threads.find((x) => x.id === chatRef.id);
    if (!t) return <Missing loading={!data.loaded} what="thread" onClose={onClose} />;
    const related = data.events.filter((e) => e.thread_id === t.id);
    head = (
      <>
        <span className="thread-icon" style={{ background: t.color }}>
          <Ic name={t.icon} size={19} />
        </span>
        <div className="chat-title">
          <b>{t.name}</b>
          <span>{t.members.toLocaleString("en-US")} members</span>
        </div>
        {(t.created_by === me.id || me.role === "admin") && (
          <a className="icon-btn" href={`/new-thread?edit=${t.id}`} aria-label="Edit thread" title="Edit thread">
            <Ic name="pen" size={18} />
          </a>
        )}
        <button className={`follow${t.followed ? " on" : ""}`} disabled={isPending(`follow:${t.id}`)} aria-busy={isPending(`follow:${t.id}`)} onClick={() => void toggleFollow(t.id)}>
          {isPending(`follow:${t.id}`) && <span className="spinner" aria-hidden />}
          {t.followed ? "Following" : "Follow"}
        </button>
      </>
    );
    extra = (
      <div className="seg chat-seg">
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>
          Related events
          {related.length ? (
            <span className="badge" style={{ background: "var(--ink-3)", color: "var(--paper)" }}>
              {related.length}
            </span>
          ) : null}
        </button>
      </div>
    );
    body =
      tab === "events" ? (
        <div className="elist">
          {t.followed && (
            <a className="create-row" href={`/new-event?kind=community&thread=${t.id}`}>
              <Ic name="plus" size={18} width={2.4} />
              Create an event in this thread
            </a>
          )}
          {related.length ? (
            related.map((e) => <ERow key={e.id} e={e} />)
          ) : (
            <div className="empty">
              No events yet.
              <br />
              Events created in this chat will show up here.
            </div>
          )}
        </div>
      ) : t.followed ? (
        msgList
      ) : (
        <div className="msgs">
          <div className="empty">
            Follow <b>{t.name}</b> to read and join the chat.
          </div>
        </div>
      );
    foot = !t.followed ? (
      <div className="join-bar">
        <span style={{ flex: 1 }}>Follow this community to join the chat.</span>
        <button className="btn primary" disabled={isPending(`follow:${t.id}`)} aria-busy={isPending(`follow:${t.id}`)} onClick={() => void toggleFollow(t.id)}>
          {isPending(`follow:${t.id}`) && <span className="spinner" aria-hidden />}
          {isPending(`follow:${t.id}`) ? "Following…" : "Follow"}
        </button>
      </div>
    ) : tab === "chat" ? (
      <Composer
        name={t.name}
        text={text}
        setText={setText}
        onSubmit={send}
        before={
          <>
            {photoBtn}
            <a className="plusbtn" aria-label="Create an event" href={`/new-event?kind=community&thread=${t.id}`}>
              <Ic name="calendar" size={19} />
            </a>
          </>
        }
      />
    ) : null;
  } else if (chatRef.type === "team") {
    const t = data.teams.find((x) => x.id === chatRef.id);
    if (!t) return <Missing loading={!data.loaded} what="team" onClose={onClose} />;
    const files = msgs.filter((m) => m.kind === "file" && m.file).reverse();
    const its = data.items.filter((x) => x.team_id === t.id);
    const n = its.filter((x) => x.due_on >= today).length;
    head = (
      <>
        <span className="thread-icon" style={{ background: t.color }}>
          <Ic name={t.icon} size={19} />
        </span>
        <div className="chat-title">
          <b>{t.name}</b>
          <span>
            {t.course_code} · {t.member_count} members ·{" "}
            <button
              className="pin"
              title="Copy the PIN"
              onClick={() => {
                void navigator.clipboard?.writeText(t.join_code).then(() => toast("PIN copied · share it with your team"));
              }}
            >
              PIN {t.join_code}
            </button>
          </span>
        </div>
      </>
    );
    const badge = (v: number) => (
      <span className="badge" style={{ background: "var(--ink-3)", color: "var(--paper)" }}>
        {v}
      </span>
    );
    extra = (
      <div className="seg chat-seg">
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          Chat
        </button>
        <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
          Files{badge(files.length)}
        </button>
        <button className={tab === "deadlines" ? "active" : ""} onClick={() => setTab("deadlines")}>
          Deadlines{n ? badge(n) : null}
        </button>
      </div>
    );
    if (tab === "files")
      body = (
        <div className="elist">
          {files.length === 0 && <div className="empty">No files yet. Attach one in the chat.</div>}
          {files.map((m) => (
            <button key={m.id} className="frow" onClick={() => void openFile(m.file!)}>
              <span className={`fbadge ${m.file!.ext}`}>{m.file!.ext.toUpperCase()}</span>
              <span className="body">
                <span className="t">{m.file!.name}</span>
                <span className="kind">
                  {m.user_id === me.id ? "You" : nameOf(m.author)} · {m.file!.size} · {chatTime(m.created_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      );
    else if (tab === "deadlines")
      body = (
        <div className="elist">
          <button className="create-row" onClick={() => openSheet({ kind: "deadline", teamId: t.id })}>
            <Ic name="plus" size={18} width={2.4} />
            Add a deadline
          </button>
          {its.length ? its.map((x) => <UniRow key={x.id} x={x} />) : <div className="empty">No deadlines yet.</div>}
        </div>
      );
    else body = msgList;
    foot =
      tab === "chat" ? (
        <Composer
          name={t.name}
          text={text}
          setText={setText}
          onSubmit={send}
          before={
            <>
              {photoBtn}
              <label className="plusbtn" aria-label="Attach a file" style={{ cursor: "pointer" }}>
                <Ic name="clip" size={19} />
                <input
                  type="file"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void attach(f);
                  }}
                />
              </label>
              <button type="button" className="plusbtn" aria-label="Add a deadline" onClick={() => openSheet({ kind: "deadline", teamId: t.id })}>
                <Ic name="flag" size={19} />
              </button>
            </>
          }
        />
      ) : null;
  } else {
    const e = data.events.find((x) => x.id === chatRef.id);
    if (!e) return <Missing loading={!data.loaded} what="event chat" onClose={onClose} />;
    head = (
      <>
        <Thumb e={e} cls="chimg" />
        <div className="chat-title">
          <b>{e.title}</b>
          <span>
            {fmtShort(e.next_on)} · {to12h(e.starts_at)} · {e.kind === "community" ? e.going_count + 1 : e.going_count} going
          </span>
        </div>
      </>
    );
    body = msgList;
    foot = <Composer name="the group" text={text} setText={setText} onSubmit={send} before={photoBtn} />;
  }

  return (
    <>
      <div className="chat-head">
        <button className="icon-btn" aria-label="Back" onClick={onClose}>
          <Ic name="back" size={22} width={2.2} />
        </button>
        {head}
      </div>
      {extra}
      {body}
      {foot}
    </>
  );
}

function Composer({
  name,
  text,
  setText,
  onSubmit,
  before,
}: {
  name: string;
  text: string;
  setText: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  before?: React.ReactNode;
}) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      {before}
      <input autoComplete="off" placeholder={`Message ${name}…`} aria-label="Message" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      <button className="send" type="submit" aria-label="Send">
        <Ic name="send" size={18} width={2.2} />
      </button>
    </form>
  );
}

function Bubbles({ msgs, photoUrls, hostId, onFile }: { msgs: Message[]; photoUrls: Map<string, string>; hostId?: string; onFile: (f: FileInfo) => void }) {
  const { me } = useApp();
  const dayOf = (ts: string) => new Date(ts).toDateString();
  return (
    <>
      {msgs.map((m, i) => {
        const day = dayOf(m.created_at);
        const newDay = i === 0 || dayOf(msgs[i - 1].created_at) !== day;
        const sep = newDay ? <div className="daysep">{day === new Date().toDateString() ? "TODAY" : chatTime(m.created_at).toUpperCase()}</div> : null;
        const mine = m.user_id === me.id;
        const name = nameOf(m.author);
        const color = m.author?.color ?? colorFor(name);
        const card =
          m.kind === "event" && m.ref_event ? (
            <EventCard id={m.ref_event} />
          ) : m.kind === "file" && m.file ? (
            <button className="fmsg" onClick={() => onFile(m.file!)}>
              <span className={`fbadge ${m.file.ext}`}>{m.file.ext.toUpperCase()}</span>
              <span className="body">
                {!mine && (
                  <span className="who" style={{ color }}>
                    {name}
                  </span>
                )}
                <span className="t">{m.file.name}</span>
                <span className="kind">
                  {m.file.size} · {chatTime(m.created_at)}
                </span>
              </span>
            </button>
          ) : m.kind === "image" && m.file ? (
            <a className="imgmsg" href={photoUrls.get(m.file.path)} target="_blank" rel="noopener noreferrer">
              {photoUrls.get(m.file.path) ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage link
                <img
                  src={photoUrls.get(m.file.path)}
                  alt={`Photo from ${mine ? "you" : name}`}
                  // Photos load after the scroll to the bottom; keep the end in view.
                  onLoad={(ev) => {
                    const box = ev.currentTarget.closest(".msgs");
                    if (box) box.scrollTop = box.scrollHeight;
                  }}
                />
              ) : (
                <span className="imgmsg-ph">Photo</span>
              )}
              {!mine && (
                <span className="who" style={{ color }}>
                  {name}
                </span>
              )}
              <span className="t">{chatTime(m.created_at)}</span>
            </a>
          ) : m.kind === "deadline" && m.ref_item ? (
            <DeadlineCard id={m.ref_item} />
          ) : null;
        const av = (
          <span className="avatar" style={{ background: color }}>
            {initials(name)}
          </span>
        );
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {sep}
            {mine ? (
              card ? (
                <div className="msg me">{card}</div>
              ) : (
                <div className="msg me">
                  <div className="bubble">
                    {m.body}
                    <span className="t">{chatTime(m.created_at)}</span>
                  </div>
                </div>
              )
            ) : card ? (
              <div className="msg">
                {av}
                {card}
              </div>
            ) : (
              <div className="msg">
                {av}
                <div className="bubble">
                  <span className="who" style={{ color }}>
                    {name}
                    {hostId && m.user_id === hostId ? <em>host</em> : null}
                  </span>
                  {m.body}
                  <span className="t">{chatTime(m.created_at)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function EventCard({ id }: { id: string }) {
  const { data, isGoing, isFull, toggleJoin, openDetail, openChat, isPending } = useApp();
  const e = data.events.find((x) => x.id === id);
  if (!e) return <div className="evmsg"><div className="evlabel">Event no longer available</div></div>;
  const on = isGoing(id);
  const full = isFull(e);
  return (
    <div className="evmsg" onClick={() => openDetail(id)} {...openable(() => openDetail(id), e.title)}>
      <div className="evlabel">
        <Ic name="calendar" size={13} width={2.2} />
        Event
      </div>
      <div className="evrow">
        <Thumb e={e} cls="eimg" />
        <div>
          <div className="evt">{e.title}</div>
          <div className="evw">
            {fmtShort(e.next_on)} · {to12h(e.starts_at)}
          </div>
        </div>
      </div>
      <div className="evfoot">
        <span>
          {goingText(e)}
        </span>
        {on ? (
          <button
            className="btn on"
            onClick={(ev) => {
              ev.stopPropagation();
              openChat({ type: "event", id });
            }}
          >
            Open chat
          </button>
        ) : (
          <button
            className={`btn ${full ? "" : "primary"}`}
            disabled={isPending(`join:${id}`)}
            aria-busy={isPending(`join:${id}`)}
            onClick={(ev) => {
              ev.stopPropagation();
              void toggleJoin(e);
            }}
          >
            {isPending(`join:${id}`) && <span className="spinner" aria-hidden />}
            {isPending(`join:${id}`) ? "Joining…" : full ? "Waitlist" : "Join"}
          </button>
        )}
      </div>
    </div>
  );
}

function DeadlineCard({ id }: { id: string }) {
  const { data, today } = useApp();
  const x = data.items.find((i) => i.id === id);
  if (!x) return null;
  return (
    <div className="dlmsg">
      <div className="evlabel">
        <Ic name="flag" size={13} width={2.2} />
        Deadline added
      </div>
      <div className="evt">{x.title}</div>
      <div className="evw">
        {fmtShort(x.due_on)} · {to12h(x.due_at)} · <b>{dueIn(x.due_on, today)}</b>
      </div>
    </div>
  );
}

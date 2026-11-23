// One-off import from the Sidequest app (Guido's), agreed with its owner:
//   - its @sidequest.app test accounts move as they are (same id, email and
//     password hash, so their passwords keep working);
//   - an account whose email already exists here is matched to it;
//   - everyone else who appears in the content gets a stand-in demo account
//     (@sidequest.test, new password in scripts/demo-accounts.txt) under
//     the same short name; their own email and password are NOT copied,
//     only a hash of the email, so signing up here with it takes the
//     stand-in over (claim_imported_account);
//   - public Sidequests become threads (same-name ones merged), their
//     members follow them; dated posts become community events with their
//     chat participants and messages.
//
// Run: SQ_DATABASE_URL=… SQ_DATABASE_PASSWORD=… node --env-file=.env.local scripts/import-sidequest.mjs

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const connect = (url, password) => {
  const u = new URL(url);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    database: "postgres",
    user: decodeURIComponent(u.username),
    password: password || decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
  });
};

const src = connect(process.env.SQ_DATABASE_URL, process.env.SQ_DATABASE_PASSWORD);
const dst = connect(process.env.DATABASE_URL, process.env.DATABASE_PASSWORD);
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TOPICS = [
  [/hik|alishan|forest|mountain/i, "Outdoors", "mountain", "#B8D8A8"],
  [/language/i, "Language", "lang", "#9CCBB1"],
  [/bowling|game/i, "Gaming", "game", "#C9B6F2"],
  [/night market|food/i, "Food", "bowl", "#F2A488"],
  [/boulder|climb/i, "Sports", "run", "#8FC1E3"],
  [/surf/i, "Sports", "wave", "#7FD1C1"],
  [/social|spark/i, "Culture", "users", "#E8A0BF"],
];
const topic = (name) => TOPICS.find(([re]) => re.test(name)) ?? [null, "Culture", "users", "#F0C987"];
const taipei = (ts) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ts))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

async function main() {
  await src.connect();
  await dst.connect();

  // ---- who appears in the content
  const sidequests = (await src.query("select id, name, description, member_count from public.sidequests where not is_private")).rows;
  const sqIds = sidequests.map((s) => s.id);
  const events = (
    await src.query(
      `select p.id, p.title, p.body, p.author_id, p.sidequest_id, pe.starts_at, pe.repeat, pe.repeat_interval, pe.repeat_until,
              pe.chat_join_mode, pe.chat_max_participants, pe.conversation_id
       from public.post_events pe join public.posts p on p.id = pe.post_id where p.sidequest_id = any($1)`,
      [sqIds],
    )
  ).rows;
  const convIds = events.map((e) => e.conversation_id).filter(Boolean);
  const members = (await src.query("select sidequest_id, user_id from public.sidequest_members where sidequest_id = any($1)", [sqIds])).rows;
  const participants = (await src.query("select conversation_id, user_id, joined_at from public.conversation_participants where conversation_id = any($1)", [convIds])).rows;
  const messages = (
    await src.query(
      `select conversation_id, sender_id, body, created_at from public.messages
       where conversation_id = any($1) and kind is distinct from 'system' and system_event is null
         and deleted_for_everyone_at is null and body is not null and btrim(body) <> ''
       order by created_at`,
      [convIds],
    )
  ).rows;

  const people = new Set([...members.map((m) => m.user_id), ...participants.map((p) => p.user_id), ...events.map((e) => e.author_id), ...messages.map((m) => m.sender_id)]);
  const testAccounts = (await src.query("select id from auth.users where email like '%@sidequest.app'")).rows.map((r) => r.id);
  testAccounts.forEach((id) => people.add(id));
  const profiles = new Map(
    (await src.query("select p.id, p.given_name, p.family_name, p.display_label, u.email from public.profiles p join auth.users u on u.id = p.id where p.id = any($1)", [[...people]])).rows.map(
      (r) => [r.id, r],
    ),
  );

  // ---- accounts here
  const idMap = new Map(); // source user id → id here
  const existing = new Map((await dst.query("select id, lower(email) email from auth.users")).rows.map((r) => [r.email, r.id]));
  const lines = [];
  let moved = 0, matched = 0, standIns = 0;

  const nameParts = (p) => {
    const first = (p?.given_name || p?.display_label?.split(" ")[0] || "Member").trim().slice(0, 30);
    const lastRaw = (p?.family_name || p?.display_label?.split(" ").slice(1).join(" ") || "").replace(/\./g, "").trim();
    return { first, last: [...lastRaw].slice(0, 3).join("") || null };
  };

  for (const uid of people) {
    const p = profiles.get(uid);
    if (!p) continue;
    const email = (p.email || "").toLowerCase();
    if (existing.has(email)) {
      idMap.set(uid, existing.get(email));
      matched++;
      continue;
    }
    if (email.endsWith("@sidequest.app")) {
      const a = (
        await src.query(
          "select id, email, encrypted_password, email_confirmed_at, created_at, raw_app_meta_data, raw_user_meta_data from auth.users where id = $1",
          [uid],
        )
      ).rows[0];
      await dst.query(
        `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
           phone_change, phone_change_token, reauthentication_token)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, coalesce($4, now()),
           '{"provider":"email","providers":["email"]}', '{}', $5, now(), '', '', '', '', '', '', '', '')`,
        [a.id, a.email, a.encrypted_password, a.email_confirmed_at, a.created_at],
      );
      await dst.query(
        `insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, 'email', jsonb_build_object('sub', $2::text, 'email', $3::text, 'email_verified', true, 'phone_verified', false), now(), now())`,
        [a.id, String(a.id), a.email],
      );
      idMap.set(uid, a.id);
      moved++;
    } else {
      const { first, last } = nameParts(p);
      const handle = `${first}${last ?? ""}`.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "") || "member";
      const standInEmail = `${handle}-${crypto.randomBytes(2).toString("hex")}@sidequest.test`;
      const password = crypto.randomBytes(9).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email: standInEmail, password, email_confirm: true });
      if (error) throw new Error(`stand-in for ${first}: ${error.message}`);
      idMap.set(uid, data.user.id);
      // Lets them take this over by signing up with the same email
      // (claim_imported_account). Only the hash is stored.
      const hash = crypto.createHash("sha256").update(email).digest("hex");
      await dst.query("insert into private.imported_accounts (email_hash, standin) values ($1, $2) on conflict (email_hash) do update set standin = excluded.standin", [
        hash,
        data.user.id,
      ]);
      lines.push(`${first} ${last ?? ""}\t${standInEmail}\t${password}`);
      standIns++;
    }
    const { first, last } = nameParts(p);
    await dst.query("update public.profiles set first_name = $2, last_short = $3, tag = coalesce(tag, 'Student · Taipei') where id = $1 and first_name is null", [
      idMap.get(uid),
      first,
      last,
    ]);
  }
  if (lines.length) fs.appendFileSync(path.join(dir, "demo-accounts.txt"), `${lines.join("\n")}\n`);

  // ---- threads (same-name Sidequests merged)
  const threadByName = new Map();
  const threadOf = new Map(); // sidequest id → thread id
  for (const s of sidequests.sort((a, b) => b.member_count - a.member_count)) {
    const name = s.name.trim().slice(0, 60);
    if (!threadByName.has(name)) {
      const [, tag, icon, color] = topic(s.name);
      const r = await dst.query("insert into public.threads (name, tag, icon, color) values ($1, $2, $3, $4) returning id", [name, tag, icon, color]);
      threadByName.set(name, r.rows[0].id);
    }
    threadOf.set(s.id, threadByName.get(name));
  }
  for (const m of members) {
    const uid = idMap.get(m.user_id);
    if (uid) await dst.query("insert into public.follows (thread_id, user_id) values ($1, $2) on conflict do nothing", [threadOf.get(m.sidequest_id), uid]);
  }

  // ---- events, going, chat
  for (const e of events) {
    const host = idMap.get(e.author_id);
    if (!host) continue;
    const { date, time } = taipei(e.starts_at);
    const repeat = e.repeat === "weekly" && e.repeat_interval === 2 ? "biweekly" : ["weekly", "monthly"].includes(e.repeat) && e.repeat_interval === 1 ? e.repeat : "none";
    const r = await dst.query(
      `insert into public.events (kind, thread_id, host_id, title, tag, starts_on, starts_at, place, description, max_going, repeat, repeat_until, join_mode)
       values ('community', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        threadOf.get(e.sidequest_id) ?? null,
        host,
        e.title.trim().slice(0, 80),
        topic(e.title)[1] === "Gaming" ? "Games" : ["Outdoors", "Sports", "Food", "Culture", "Language"].includes(topic(e.title)[1]) ? topic(e.title)[1] : "Other",
        date,
        time,
        "Taipei",
        e.body?.slice(0, 2000) ?? null,
        e.chat_max_participants ?? null,
        repeat,
        repeat === "none" ? null : e.repeat_until,
        e.chat_join_mode === "open" ? "open" : "approval",
      ],
    );
    const eventId = r.rows[0].id;
    // Going: the event chat's participants, as approved members.
    // Without triggers: they'd turn these into join requests (private
    // events) and notify the host about each one.
    await dst.query("set session_replication_role = replica");
    for (const p of participants.filter((x) => x.conversation_id === e.conversation_id)) {
      const uid = idMap.get(p.user_id);
      if (uid && uid !== host) {
        await dst.query("insert into public.going (event_id, user_id, status, created_at) values ($1, $2, 'going', $3) on conflict do nothing", [eventId, uid, p.joined_at]);
      }
    }
    await dst.query("set session_replication_role = origin");
    await dst.query("update public.events set going_count = (select count(*) from public.going where event_id = $1 and status = 'going') where id = $1", [eventId]);
    for (const m of messages.filter((x) => x.conversation_id === e.conversation_id)) {
      const uid = idMap.get(m.sender_id);
      if (uid) await dst.query("insert into public.messages (event_id, user_id, kind, body, created_at) values ($1, $2, 'text', $3, $4)", [eventId, uid, m.body.slice(0, 2000), m.created_at]);
    }
    // Posted in its thread's chat, like events created here.
    if (threadOf.get(e.sidequest_id)) {
      await dst.query("insert into public.messages (thread_id, user_id, kind, ref_event) values ($1, $2, 'event', $3)", [threadOf.get(e.sidequest_id), host, eventId]);
    }
  }
  // Imports aren't news: no bell notices from it.
  await dst.query("delete from public.notifications");
  await dst.query("notify pgrst, 'reload schema'");
  console.log(
    `accounts: ${moved} moved, ${matched} matched to existing, ${standIns} stand-ins; threads: ${threadByName.size}; events: ${events.length}; messages: ${messages.length}`,
  );
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await src.end().catch(() => {});
    await dst.end().catch(() => {});
  }
})();

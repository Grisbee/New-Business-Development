// Database chores, run with the keys in .env.local:
//   npm run db:migrate         apply supabase/migrations/*.sql not applied yet
//   npm run db:seed            (re)create the demo data from the mockup
//   npm run db:admin <email>   make an existing account an admin
//
// Demo accounts are created through the admin API as already confirmed,
// with @sidequest.test addresses, so no email is ever sent. Their
// passwords go to scripts/demo-accounts.txt (git-ignored).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const need = (k) => {
  if (!process.env[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
  return process.env[k];
};

// DATABASE_URL is the pooler URI as Supabase shows it (with or without the
// password); DATABASE_PASSWORD, when set, is used as the password, so it
// never needs URL-encoding.
async function db(fn) {
  const url = new URL(need("DATABASE_URL"));
  const client = new pg.Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1) || "postgres",
    user: decodeURIComponent(url.username),
    password: process.env.DATABASE_PASSWORD || decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function migrate() {
  await db(async (c) => {
    await c.query("create schema if not exists private");
    await c.query("create table if not exists private.applied_migrations (name text primary key, applied_at timestamptz not null default now())");
    const done = new Set((await c.query("select name from private.applied_migrations")).rows.map((r) => r.name));
    const files = fs.readdirSync(path.join(dir, "../supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, "../supabase/migrations", f), "utf8");
      process.stdout.write(`applying ${f}… `);
      await c.query("begin");
      try {
        await c.query(sql);
        await c.query("insert into private.applied_migrations (name) values ($1)", [f]);
        await c.query("commit");
        console.log("ok");
      } catch (e) {
        await c.query("rollback");
        console.log("FAILED");
        throw e;
      }
    }
    console.log("migrations up to date");
  });
}

const to24 = (t) => {
  const m = /(\d+):(\d+)\s*(AM|PM)/.exec(t);
  const h = (+m[1] % 12) + (m[3] === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

async function seed() {
  const require = createRequire(import.meta.url);
  const M = require("./mockup-data.cjs");
  const admin = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  // Shift the mockup's dates (today = Mon 28 Sep 2026) to this week, whole
  // weeks only so the weekdays stay right.
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date()));
  const mockToday = new Date(M.TODAY);
  const weeks = Math.round((today - mockToday) / (7 * 864e5));
  const shift = (iso) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };

  // People in the mockup, plus "demo" standing in for its "me".
  const tags = Object.fromEntries(M.PEOPLE.map(([n, t]) => [n, t]));
  const names = new Set(["demo"]);
  const venues = {};
  for (const e of M.EVENTS) {
    if (e.kind === "public" && e.chat?.[0]?.[3]) venues[e.chat[0][0]] = e.venue || e.place.split(" · ")[0];
    if (e.host) names.add(e.host);
    (e.chat || []).forEach((m) => names.add(m[0]));
  }
  M.THREADS.forEach((t) => t.msgs.forEach((m) => names.add(m[0])));
  M.TEAMS.forEach((t) => {
    t.members.forEach((m) => names.add(m));
    t.msgs.forEach((m) => names.add(m[0]));
  });
  M.PEOPLE.forEach(([n]) => names.add(n));
  names.delete("me");
  M.EVENTS.forEach((e) => e.host && e.hostTag && (tags[e.host] ??= e.hostTag));

  console.log("removing old demo data…");
  await db(async (c) => {
    await c.query("delete from auth.users where email like '%@sidequest.test'");
    await c.query("delete from public.threads where created_by is null");
    await c.query("delete from public.teams t where not exists (select 1 from public.team_members m where m.team_id = t.id)");
  });

  console.log(`creating ${names.size} demo accounts…`);
  const ids = {};
  const lines = [];
  for (const n of names) {
    const password = crypto.randomBytes(9).toString("base64url");
    const email = `${n.replace(/[^a-z0-9]/g, "")}@sidequest.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`${email}: ${error.message}`);
    ids[n] = data.user.id;
    lines.push(`${n}\t${email}\t${password}`);
  }
  fs.writeFileSync(path.join(dir, "demo-accounts.txt"), `username\temail\tpassword\n${lines.join("\n")}\n`);
  const uid = (n) => ids[n === "me" ? "demo" : n];

  await db(async (c) => {
    await c.query("begin");
    for (const n of names) {
      const venue = venues[n];
      await c.query("update public.profiles set username = $2, tag = $3, role = $4, venue_name = $5 where id = $1", [
        ids[n],
        n,
        n === "demo" ? "Exchange · NTUST" : (tags[n] ?? (venue ? "Venue" : "Student · Taipei")),
        venue ? "venue" : "user",
        venue ?? null,
      ]);
    }

    // Threads, with the mockup's member and online counts as a head start.
    const threadIds = {};
    for (const t of M.THREADS) {
      const r = await c.query(
        "insert into public.threads (name, icon, color, tag, seed_members, seed_active) values ($1,$2,$3,$4,$5,$6) returning id",
        [t.name, t.icon, t.color, t.tag, Math.max(0, t.members - 5), t.online],
      );
      threadIds[t.id] = r.rows[0].id;
      const followers = new Set(t.msgs.map((m) => m[0]));
      if (t.followed) followers.add("me");
      for (const f of followers) await c.query("insert into public.follows (thread_id, user_id) values ($1,$2) on conflict do nothing", [threadIds[t.id], uid(f)]);
    }

    // Events.
    const eventIds = {};
    for (const e of M.EVENTS) {
      const d = M.DETAILS[e.id] || {};
      const pub = e.kind === "public";
      const host = pub ? Object.keys(venues).find((v) => venues[v] === (e.venue || e.place.split(" · ")[0])) : e.host;
      const tickets = (d.tickets || []).map(([name, note, price]) => ({ name, note: note || null, price }));
      const r = await c.query(
        `insert into public.events (kind, thread_id, host_id, title, tag, starts_on, starts_at, place, description, price, tickets, max_going, image, seed_going)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [
          e.kind,
          pub ? null : threadIds[e.thread] ?? null,
          uid(host),
          e.title,
          e.tag,
          shift(e.date),
          to24(e.time),
          e.place,
          d.desc ?? e.desc ?? null,
          e.price ?? 0,
          JSON.stringify(tickets),
          pub ? null : e.max,
          e.img ? `demo:${e.img}` : null,
          Math.max(0, (e.going ?? 0) - (pub ? 0 : 2)),
        ],
      );
      eventIds[e.id] = r.rows[0].id;
    }
    // The demo user goes to p0 (with a ticket), c0 and c1, as in the mockup.
    for (const [k, tier] of [["p0", 0], ["c0", null], ["c1", null]]) {
      if (eventIds[k]) await c.query("insert into public.going (event_id, user_id, tier, qty) values ($1,$2,$3,1)", [eventIds[k], ids.demo, tier]);
    }
    // Everyone who wrote in an event chat is going.
    for (const e of M.EVENTS) {
      const host = e.kind === "public" ? null : e.host;
      for (const m of new Set((e.chat || []).map((x) => x[0]))) {
        if (m === host || Object.keys(venues).includes(m)) continue;
        const tier = M.DETAILS[e.id]?.tickets?.length ? 0 : null;
        await c.query("insert into public.going (event_id, user_id, tier) values ($1,$2,$3) on conflict do nothing", [eventIds[e.id], uid(m), tier]);
      }
    }

    // Teams and the university calendar.
    const teamIds = {};
    for (const t of M.TEAMS) {
      const r = await c.query("insert into public.teams (name, course_code, course_name, icon, color) values ($1,$2,$3,$4,$5) returning id", [
        t.name,
        t.course,
        M.COURSES[t.course] ?? null,
        t.icon,
        t.color,
      ]);
      teamIds[t.id] = r.rows[0].id;
      for (const m of new Set([...t.members, "me", ...t.msgs.map((x) => x[0])])) {
        await c.query("insert into public.team_members (team_id, user_id) values ($1,$2) on conflict do nothing", [teamIds[t.id], uid(m)]);
      }
    }
    const itemIds = {};
    for (const x of M.UNI_ITEMS) {
      const owner = x.team ? M.TEAMS.find((t) => t.id === x.team).members[0] : "me";
      const r = await c.query(
        "insert into public.uni_items (kind, team_id, user_id, course, title, due_on, due_at, place) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        [x.kind, x.team ? teamIds[x.team] : null, uid(owner), x.course, x.title, shift(x.date), to24(x.time), x.place ?? null],
      );
      itemIds[x.id] = r.rows[0].id;
    }

    // Messages: the mockup's chats, spread over the last few hours.
    const msg = async (channel, id, list) => {
      let t = Date.now() - list.length * 7 * 60000;
      for (const [who, payload] of list) {
        t += 7 * 60000;
        const at = new Date(t).toISOString();
        const base = { [channel]: id, user_id: uid(who), created_at: at };
        let row;
        if (typeof payload === "string") row = { ...base, kind: "text", body: payload };
        else if (payload.event) row = { ...base, kind: "event", ref_event: eventIds[payload.event] };
        else if (payload.deadline) row = { ...base, kind: "deadline", ref_item: itemIds[payload.deadline] };
        else if (payload.file) {
          const [name, ext, size] = payload.file;
          const p = `${id}/demo-${name}`;
          await admin.storage.from("team-files").upload(p, new Blob([`Demo file: ${name}\n`], { type: "text/plain" }), { upsert: true });
          row = { ...base, kind: "file", file: JSON.stringify({ name, ext, size, path: p }) };
        }
        if (!row || (row.kind === "event" && !row.ref_event) || (row.kind === "deadline" && !row.ref_item)) continue;
        const cols = Object.keys(row);
        await c.query(`insert into public.messages (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
      }
    };
    for (const t of M.THREADS) await msg("thread_id", threadIds[t.id], t.msgs);
    for (const e of M.EVENTS) await msg("event_id", eventIds[e.id], e.chat || []);
    for (const t of M.TEAMS) await msg("team_id", teamIds[t.id], t.msgs);

    await c.query("commit");
  });
  console.log("demo data ready; accounts in scripts/demo-accounts.txt (log in as demo@sidequest.test)");
}

async function makeAdmin(email) {
  if (!email) throw new Error("usage: npm run db:admin <email>");
  await db(async (c) => {
    const r = await c.query("update public.profiles p set role = 'admin' from auth.users u where u.id = p.id and u.email = $1 returning p.id", [email]);
    console.log(r.rowCount ? `${email} is now an admin` : `no account with ${email}`);
  });
}

const [cmd, arg] = process.argv.slice(2);
const run = { migrate, seed, admin: () => makeAdmin(arg) }[cmd];
if (!run) {
  console.error("usage: node scripts/db.mjs migrate|seed|admin <email>");
  process.exit(1);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});

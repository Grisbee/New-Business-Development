// Lists real Taipei events (researched by hand into a JSON file) as public
// events by the "SideQuest Picks" curator account, each linking to the
// organiser's page. Cover photos are freely licensed ones from Wikimedia
// Commons (the venue, else something fitting the tag), never the
// organiser's own artwork; their credit is shown on the photo.
//
//   node --env-file=.env.local scripts/import-listed-events.mjs events.json [--dry]
//
// Re-running skips events already listed (same title and date).

import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const [file, flag] = process.argv.slice(2);
const dry = flag === "--dry";
const events = JSON.parse(fs.readFileSync(file, "utf8"));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const UA = "SideQuestEventImport/0.1 (https://sidequest-city-omega.vercel.app)";
const TAGS = ["Clubs", "Live Music", "Bars", "Food", "Festivals", "Arts", "Workshops", "Markets", "Sports"];
// When the venue has no usable photo.
const TAG_QUERY = {
  Clubs: "nightclub dance floor lights",
  "Live Music": "concert stage crowd Taipei",
  Bars: "cocktail bar Taipei",
  Food: "Taiwanese street food",
  Festivals: "Taipei festival",
  Arts: "Taipei art exhibition",
  Workshops: "workshop handicraft Taiwan",
  Markets: "Taipei market stalls",
  Sports: "Taipei Arena",
};
const FREE = /^(cc0|cc by(-sa)?( \d\.\d)?|public domain|pd)/i;

async function curator() {
  const email = "picks@sidequest.app";
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await admin
    .from("profiles")
    .update({ first_name: "SideQuest", last_short: "Pic", role: "venue", venue_name: "SideQuest Picks", tag: "Events around Taipei", color: "#EF7393" })
    .eq("id", user.id);
  if (error) throw error;
  // Nobody signs in as the curator.
  await admin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
  return user.id;
}

const strip = (html) => (html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// The best freely licensed landscape photo on Commons for `query`.
const photoCache = new Map();
async function findPhoto(query) {
  if (photoCache.has(query)) return photoCache.get(query);
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata|mime",
    iiurlwidth: "1600",
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
  let pick = null;
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    const meta = ii?.extmetadata ?? {};
    const license = strip(meta.LicenseShortName?.value);
    if (!ii || !/jpeg|png/.test(ii.mime) || !FREE.test(license)) continue;
    if (ii.width < 1000 || ii.width < ii.height) continue;
    const artist = strip(meta.Artist?.value).slice(0, 80) || "Unknown";
    pick = { thumb: ii.thumburl ?? ii.url, credit: `${artist} / Wikimedia Commons, ${license}`.slice(0, 200), page: ii.descriptionurl };
    break;
  }
  photoCache.set(query, pick);
  return pick;
}

const uploaded = new Map();
async function upload(hostId, photo) {
  if (uploaded.has(photo.thumb)) return uploaded.get(photo.thumb);
  const res = await fetch(photo.thumb, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  const webp = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const path = `${hostId}/${crypto.randomUUID()}.webp`;
  const { error } = await admin.storage.from("event-images").upload(path, webp, { contentType: "image/webp" });
  if (error) throw error;
  uploaded.set(photo.thumb, path);
  return path;
}

const venueName = (place) => place.split(",")[0].replace(/\(.*?\)/g, "").trim();

const hostId = dry ? "dry-run" : await curator();
const { data: existing } = dry ? { data: [] } : await admin.from("events").select("title, starts_on").eq("host_id", hostId);
const seen = new Set((existing ?? []).map((e) => `${e.title}|${e.starts_on}`));
let added = 0;
for (const ev of events) {
  const key = `${ev.title}|${ev.starts_on}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!TAGS.includes(ev.tag)) ev.tag = "Festivals";
  const photo = (await findPhoto(`${venueName(ev.place)} Taipei`)) ?? (await findPhoto(TAG_QUERY[ev.tag]));
  const note = ev.price_ntd === 0 ? "Free" : ev.price_ntd ? `From NT$${ev.price_ntd.toLocaleString("en-US")}` : "Prices on site";
  const until = ev.ends_on && ev.ends_on !== ev.starts_on ? ` Runs until ${new Date(ev.ends_on).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "";
  const row = {
    kind: "public",
    host_id: hostId,
    title: ev.title.slice(0, 80),
    tag: ev.tag,
    starts_on: ev.starts_on,
    starts_at: ev.starts_at,
    place: ev.place.slice(0, 80),
    description: `${ev.description}${until}${ev.time_guess ? " Check the time on the organiser’s page." : ""}`.slice(0, 2000),
    price: ev.price_ntd ?? 0,
    price_note: note,
    source_url: ev.source_url,
    image_credit: photo?.credit ?? null,
  };
  if (dry) {
    console.log(row.starts_on, row.title, "|", photo?.page ?? "no photo");
    continue;
  }
  row.image = photo ? await upload(hostId, photo) : null;
  const { error } = await admin.from("events").insert(row);
  if (error) console.error("skip", ev.title, error.message);
  else added++;
}
console.log(dry ? "dry run done" : `added ${added} events`);

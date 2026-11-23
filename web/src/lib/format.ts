// Dates in Taipei time, formatted like the mockup ("2 Oct (Fri)", "11:00 PM").

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TZ = "Asia/Taipei";

// Today's date in Taipei as YYYY-MM-DD.
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};

export const fmtShort = (iso: string) => {
  const t = parse(iso);
  return `${t.getDate()} ${MON[t.getMonth()]} (${DOW[t.getDay()]})`;
};

export const fmtLong = (iso: string) => {
  const t = parse(iso);
  return `${DAYS[t.getDay()]}, ${t.getDate()} ${MON[t.getMonth()]}`;
};

// "23:00:00" → "11:00 PM"
export function to12h(time: string): string {
  const [h0, m] = time.split(":").map(Number);
  const ap = h0 >= 12 ? "PM" : "AM";
  const h = h0 % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

export const priceLabel = (p: number) => (p === 0 ? "Free" : `NT$${p.toLocaleString("en-US")}`);

export const dm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
};

export function dueIn(iso: string, today = todayIso()): string {
  const n = Math.round((parse(iso).getTime() - parse(today).getTime()) / 864e5);
  return n < 0 ? "Past" : n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

// Chat times: "14:32" today, "Yesterday", the weekday this week, else "2 Oct".
export function chatTime(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const day = todayIso(d);
  const today = todayIso();
  if (day === today) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  }
  if (day === addDays(today, -1)) return "Yesterday";
  const diff = (parse(today).getTime() - parse(day).getTime()) / 864e5;
  if (diff < 7) return DOW[parse(day).getDay()];
  return `${parse(day).getDate()} ${MON[parse(day).getMonth()]}`;
}

// Monday-first week presets for the date filter.
export function presets(today = todayIso()): [string, string][] {
  const t = parse(today);
  const monday = addDays(today, -((t.getDay() + 6) % 7));
  return [
    ["Any time", "|"],
    ["This week", `${today}|${addDays(monday, 6)}`],
    ["This weekend", `${addDays(monday, 5)}|${addDays(monday, 6)}`],
    ["Next week", `${addDays(monday, 7)}|${addDays(monday, 13)}`],
  ];
}

export const USER_COLORS = ["#8FC1E3", "#E8A0BF", "#F0C987", "#B8D8A8", "#C9B6F2", "#F2A488", "#7FD1C1"];

export const initials = (name: string | null | undefined) => (name ?? "?").slice(0, 2).toUpperCase();

// Event photo: a demo key ("demo:p0") or a storage path in event-images.
export function imageUrl(image: string | null): string | null {
  if (!image) return null;
  if (image.startsWith("demo:")) return `/demo/${image.slice(5)}.jpg`;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-images/${image}`;
}

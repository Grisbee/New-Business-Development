// Row shapes as the app reads them (kept by hand; small schema).

export type Role = "user" | "venue" | "admin";

export type Profile = {
  id: string;
  username: string | null;
  first_name: string | null;
  last_short: string | null;
  // "Paweł Śli": first name and the first three letters of the last name.
  display_name: string | null;
  tag: string | null;
  university: string | null;
  color: string;
  role: Role;
  venue_name: string | null;
};

export type PersonLite = Pick<Profile, "id" | "username" | "display_name" | "color" | "tag" | "venue_name" | "role">;

// How people are named in the app: "Paweł Śli", else the username.
export const nameOf = (p: { display_name?: string | null; username?: string | null } | null | undefined) =>
  p?.display_name || p?.username || "Someone";

export type Ticket = { name: string; note?: string | null; price: number };

export type EventRow = {
  id: string;
  kind: "public" | "community";
  thread_id: string | null;
  host_id: string;
  title: string;
  tag: string;
  starts_on: string; // YYYY-MM-DD
  starts_at: string; // HH:MM:SS
  place: string;
  description: string | null;
  price: number;
  tickets: Ticket[];
  max_going: number | null;
  image: string | null;
  going_count: number;
  repeat: Repeat;
  repeat_until: string | null;
  // "approval": people ask to join and the host says yes or no.
  join_mode: "open" | "approval";
  // The next date it happens on (today or later), or the last one once a
  // series is over. Filled in on load; the lists use it instead of starts_on.
  next_on: string;
  host: PersonLite | null;
};

export type Repeat = "none" | "weekly" | "biweekly" | "monthly";

export type GoingRow = { event_id: string; status: "going" | "waitlist" | "requested"; tier: number | null; qty: number; created_at: string };

export type Thread = {
  id: string;
  name: string;
  icon: string;
  color: string;
  tag: string;
  members: number;
  active: number;
  followed: boolean;
};

export type Team = {
  id: string;
  name: string;
  course_code: string;
  course_name: string | null;
  icon: string;
  color: string;
  join_code: string;
  member_count: number;
};

export type UniItem = {
  id: string;
  kind: "deadline" | "exam" | "other";
  team_id: string | null;
  user_id: string;
  course: string;
  title: string;
  due_on: string;
  due_at: string;
  place: string | null;
};

export type FileInfo = { name: string; ext: string; size: string; path: string };

export type Message = {
  id: number;
  thread_id: string | null;
  event_id: string | null;
  team_id: string | null;
  user_id: string;
  kind: "text" | "event" | "file" | "deadline";
  body: string | null;
  ref_event: string | null;
  ref_item: string | null;
  file: FileInfo | null;
  created_at: string;
  author: { username: string | null; display_name: string | null; color: string } | null;
};

export type ChatSummary = {
  chat_key: string;
  kind: "thread" | "event" | "team";
  id: string;
  last_at: string | null;
  last_user: string | null;
  last_user_id: string | null;
  last_kind: Message["kind"] | null;
  last_body: string | null;
  last_ref_event: string | null;
  last_ref_item: string | null;
  last_file: FileInfo | null;
  unread: number;
};

export type ChatRef = { type: "thread" | "event" | "team"; id: string };

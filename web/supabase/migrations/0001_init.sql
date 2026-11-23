-- SideQuest (city app) — initial schema.
--
-- Everything the mockup shows, backed by Postgres with Row Level Security:
-- profiles with roles (user / venue / admin), venue verification requests,
-- community threads, public (venue) and community events, going / tickets
-- (dummy bookings, no payment) with a waitlist, chats (thread, event, team)
-- with unread counts, and university mode (teams, deadlines, exams, files).
--
-- Access rules live here, not in the UI. Cross-table checks go through
-- SECURITY DEFINER helpers in the `private` schema, which the Data API
-- doesn't expose.

create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;

-- ------------------------------------------------------------------ profiles

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  -- Set at onboarding; null until then.
  username text unique
    constraint profiles_username_format check (username ~ '^[a-z0-9._]{3,20}$'),
  -- "Exchange · NTU", shown under the name in lists of people.
  tag text constraint profiles_tag_length check (char_length(tag) <= 40),
  university text constraint profiles_university_length check (char_length(university) <= 60),
  color text not null default '#8FC1E3'
    constraint profiles_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role text not null default 'user' check (role in ('user', 'venue', 'admin')),
  -- The verified name events are listed under, once a venue is approved.
  venue_name text constraint profiles_venue_name_length check (char_length(venue_name) between 2 and 60),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Signed-in users see profiles" on public.profiles
  for select to authenticated using (true);
create policy "Users edit their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Role and venue name only change through review_venue_request / admins.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username, tag, university, color) on public.profiles to authenticated;

-- A profile row for every new account (colour picked from the mockup's set).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, color)
  values (
    new.id,
    (array['#8FC1E3','#E8A0BF','#F0C987','#B8D8A8','#C9B6F2','#F2A488','#7FD1C1'])[1 + floor(random() * 7)::int]
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create function private.is_admin(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'admin');
$$;

create function private.can_post_public(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and role in ('venue', 'admin'));
$$;

-- ----------------------------------------------------------- venue requests

create table public.venue_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  venue_name text not null check (char_length(btrim(venue_name)) between 2 and 60),
  area text check (char_length(area) <= 60),
  website text check (website is null or website ~ '^https?://' and char_length(website) <= 200),
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open request at a time.
create unique index venue_requests_one_pending on public.venue_requests (user_id) where status = 'pending';

alter table public.venue_requests enable row level security;

create policy "Users see their own requests; admins see all" on public.venue_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin((select auth.uid())));
create policy "Users file their own request" on public.venue_requests
  for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on public.venue_requests from anon, authenticated;
grant select on public.venue_requests to authenticated;
grant insert (venue_name, area, website, note) on public.venue_requests to authenticated;

create function public.review_venue_request(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.venue_requests;
begin
  if not private.is_admin(auth.uid()) then
    raise exception 'Only admins review venue requests' using errcode = '42501';
  end if;

  update public.venue_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request and status = 'pending'
  returning * into r;

  if not found then
    raise exception 'Request not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_approve then
    update public.profiles
    set role = case when role = 'admin' then 'admin' else 'venue' end,
        venue_name = btrim(r.venue_name)
    where id = r.user_id;
  end if;
end;
$$;

revoke all on function public.review_venue_request(uuid, boolean) from public, anon;
grant execute on function public.review_venue_request(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------ threads

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  icon text not null default 'users',
  color text not null default '#8FC1E3' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  tag text not null,
  -- Demo data: members and daily writers before the app existed.
  seed_members integer not null default 0 check (seed_members >= 0),
  seed_active integer not null default 0 check (seed_active >= 0),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.follows (
  thread_id uuid not null references public.threads on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index follows_user_idx on public.follows (user_id);

alter table public.threads enable row level security;
alter table public.follows enable row level security;

create policy "Signed-in users see threads" on public.threads for select to authenticated using (true);
create policy "Admins create threads" on public.threads for insert to authenticated
  with check (private.is_admin((select auth.uid())));

create policy "Signed-in users see follows" on public.follows for select to authenticated using (true);
create policy "Users follow for themselves" on public.follows for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users unfollow for themselves" on public.follows for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.threads, public.follows from anon, authenticated;
grant select, insert on public.threads to authenticated;
grant select, insert, delete on public.follows to authenticated;

create function private.follows_thread(p_thread uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.follows where thread_id = p_thread and user_id = p_user);
$$;

-- ------------------------------------------------------------------- events

create table public.events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('public', 'community')),
  -- Community events can be posted in a thread (they show in its chat).
  thread_id uuid references public.threads on delete set null,
  host_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  tag text not null check (char_length(tag) <= 30),
  starts_on date not null,
  starts_at time not null,
  place text not null check (char_length(btrim(place)) between 2 and 80),
  description text check (char_length(description) <= 2000),
  -- Public events: entry price in whole NT$ (0 = free) and optional ticket
  -- tiers [{name, note, price}]. Bookings are dummies: nobody pays.
  price integer not null default 0 check (price between 0 and 1000000),
  tickets jsonb not null default '[]' check (jsonb_typeof(tickets) = 'array' and jsonb_array_length(tickets) <= 6),
  -- Community events: how many can go (the host included).
  max_going integer check (max_going between 2 and 500),
  -- Storage path in event-images, or a built-in demo photo key ("demo:p0").
  image text check (char_length(image) <= 300),
  -- Demo data: people already going before the app existed.
  seed_going integer not null default 0 check (seed_going >= 0),
  going_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint events_community_has_max check (kind = 'public' or max_going is not null),
  constraint events_public_no_thread check (kind = 'community' or thread_id is null)
);
create index events_starts_on_idx on public.events (starts_on);
create index events_thread_idx on public.events (thread_id);

alter table public.events enable row level security;

create policy "Signed-in users see events" on public.events for select to authenticated using (true);
create policy "Community events by anyone, public ones by venues" on public.events
  for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and (
      (kind = 'community' and (thread_id is null or private.follows_thread(thread_id, (select auth.uid()))))
      or (kind = 'public' and private.can_post_public((select auth.uid())))
    )
  );
create policy "Hosts edit their own events" on public.events for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "Hosts and admins delete events" on public.events for delete to authenticated
  using (host_id = (select auth.uid()) or private.is_admin((select auth.uid())));

revoke all on public.events from anon, authenticated;
grant select, delete on public.events to authenticated;
grant insert (kind, thread_id, title, tag, starts_on, starts_at, place, description, price, tickets, max_going, image)
  on public.events to authenticated;
grant update (title, tag, starts_on, starts_at, place, description, price, tickets, max_going, image)
  on public.events to authenticated;

-- ---------------------------------------------------- going, tickets, waitlist

create table public.going (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  -- 'waitlist' when a community event was full; promoted when a spot frees up.
  status text not null default 'going' check (status in ('going', 'waitlist')),
  -- Ticketed public events: which tier and how many (a dummy booking).
  tier smallint check (tier between 0 and 5),
  qty smallint not null default 1 check (qty between 1 and 6),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index going_user_idx on public.going (user_id);

alter table public.going enable row level security;

create policy "Signed-in users see who's going" on public.going for select to authenticated using (true);
create policy "Users join for themselves" on public.going for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users leave for themselves" on public.going for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.going from anon, authenticated;
grant select, delete on public.going to authenticated;
grant insert (event_id, tier, qty) on public.going to authenticated;

-- Decides going vs waitlist on join, and checks the ticket tier exists.
create function private.before_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  taken integer;
begin
  select * into e from public.events where id = new.event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if e.kind = 'public' then
    if jsonb_array_length(e.tickets) > 0 then
      if new.tier is null or new.tier >= jsonb_array_length(e.tickets) then
        raise exception 'Pick a ticket' using errcode = '23514';
      end if;
    else
      new.tier := null;
      new.qty := 1;
    end if;
    new.status := 'going';
  else
    new.tier := null;
    new.qty := 1;
    select count(*) into taken from public.going where event_id = e.id and status = 'going';
    -- The host counts as one of the spots.
    new.status := case when e.seed_going + taken + 1 >= e.max_going then 'waitlist' else 'going' end;
  end if;
  return new;
end;
$$;

create trigger going_before_insert
before insert on public.going
for each row execute function private.before_join();

-- Keeps events.going_count current and moves the waitlist up.
create function private.after_going_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  e public.events;
  next_user uuid;
begin
  select * into e from public.events where id = v_event;
  if not found then
    return null;
  end if;

  if tg_op = 'DELETE' and old.status = 'going' and e.kind = 'community' then
    select user_id into next_user from public.going
    where event_id = v_event and status = 'waitlist'
    order by created_at limit 1;
    if next_user is not null then
      update public.going set status = 'going' where event_id = v_event and user_id = next_user;
    end if;
  end if;

  update public.events
  set going_count = seed_going + coalesce((
    select sum(qty) from public.going where event_id = v_event and status = 'going'
  ), 0)
  where id = v_event;
  return null;
end;
$$;

create trigger going_after_change
after insert or delete or update of status on public.going
for each row execute function private.after_going_change();

create function private.is_event_member(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events where id = p_event and host_id = p_user)
      or exists (select 1 from public.going where event_id = p_event and user_id = p_user and status = 'going');
$$;

-- -------------------------------------------------------------------- teams

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  course_code text not null check (char_length(btrim(course_code)) between 2 and 12),
  course_name text check (char_length(course_name) <= 60),
  icon text not null default 'users',
  color text not null default '#F0C987' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Shared to invite classmates; anyone with it can join.
  join_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create function private.is_team_member(p_team uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = p_user);
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Members see their teams" on public.teams for select to authenticated
  using (private.is_team_member(id, (select auth.uid())));
create policy "Members see their teammates" on public.team_members for select to authenticated
  using (private.is_team_member(team_id, (select auth.uid())));
create policy "Members leave their team" on public.team_members for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.teams, public.team_members from anon, authenticated;
grant select on public.teams to authenticated;
grant select, delete on public.team_members to authenticated;

-- Creating and joining go through these, so the creator is always a member
-- and join codes can't be listed.
create function public.create_team(p_name text, p_course_code text, p_course_name text, p_icon text, p_color text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.teams (name, course_code, course_name, icon, color, created_by)
  values (btrim(p_name), upper(btrim(p_course_code)), nullif(btrim(p_course_name), ''),
          coalesce(p_icon, 'users'), coalesce(p_color, '#F0C987'), auth.uid())
  returning id into v_team;
  insert into public.team_members (team_id, user_id) values (v_team, auth.uid());
  return v_team;
end;
$$;

create function public.join_team(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select id into v_team from public.teams where join_code = upper(btrim(p_code));
  if v_team is null then
    raise exception 'No team with that code' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team, auth.uid())
  on conflict do nothing;
  return v_team;
end;
$$;

revoke all on function public.create_team(text, text, text, text, text) from public, anon;
revoke all on function public.join_team(text) from public, anon;
grant execute on function public.create_team(text, text, text, text, text) to authenticated;
grant execute on function public.join_team(text) to authenticated;

-- ---------------------------------------------- university calendar items

create table public.uni_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('deadline', 'exam', 'other')),
  -- Team deadlines are shared with the team; everything else is personal.
  team_id uuid references public.teams on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  course text not null check (char_length(btrim(course)) between 2 and 12),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  due_on date not null,
  due_at time not null,
  place text check (char_length(place) <= 80),
  created_at timestamptz not null default now(),
  constraint uni_items_team_deadlines check (team_id is null or kind = 'deadline')
);
create index uni_items_due_idx on public.uni_items (due_on);

alter table public.uni_items enable row level security;

create policy "Own items and team deadlines" on public.uni_items for select to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and private.is_team_member(team_id, (select auth.uid()))));
create policy "Add own items or deadlines in own teams" on public.uni_items for insert to authenticated
  with check (user_id = (select auth.uid()) and (team_id is null or private.is_team_member(team_id, (select auth.uid()))));
create policy "Delete own items" on public.uni_items for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.uni_items from anon, authenticated;
grant select, delete on public.uni_items to authenticated;
grant insert (kind, team_id, course, title, due_on, due_at, place) on public.uni_items to authenticated;

-- ----------------------------------------------------------------- messages

create table public.messages (
  id bigint generated always as identity primary key,
  thread_id uuid references public.threads on delete cascade,
  event_id uuid references public.events on delete cascade,
  team_id uuid references public.teams on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'event', 'file', 'deadline')),
  body text check (char_length(body) <= 2000),
  -- kind = 'event': the event posted; 'deadline': the item added.
  ref_event uuid references public.events on delete cascade,
  ref_item uuid references public.uni_items on delete cascade,
  -- kind = 'file': {name, ext, size, path} in the team-files bucket.
  file jsonb,
  created_at timestamptz not null default now(),
  constraint messages_one_channel check (num_nonnulls(thread_id, event_id, team_id) = 1),
  constraint messages_kind_payload check (
    (kind = 'text' and body is not null and char_length(btrim(body)) > 0)
    or (kind = 'event' and ref_event is not null)
    or (kind = 'deadline' and ref_item is not null and team_id is not null)
    or (kind = 'file' and file is not null and team_id is not null)
  )
);
create index messages_thread_idx on public.messages (thread_id, created_at);
create index messages_event_idx on public.messages (event_id, created_at);
create index messages_team_idx on public.messages (team_id, created_at);

alter table public.messages enable row level security;

-- Thread chats are open to read (the mockup shows them before you follow);
-- writing needs a follow. Event chats are for the host and people going,
-- team chats for members.
create policy "Read chats you can see" on public.messages for select to authenticated
  using (
    thread_id is not null
    or (event_id is not null and private.is_event_member(event_id, (select auth.uid())))
    or (team_id is not null and private.is_team_member(team_id, (select auth.uid())))
  );
create policy "Write in chats you belong to" on public.messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (thread_id is not null and private.follows_thread(thread_id, (select auth.uid())))
      or (event_id is not null and private.is_event_member(event_id, (select auth.uid())))
      or (team_id is not null and private.is_team_member(team_id, (select auth.uid())))
    )
  );

revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (thread_id, event_id, team_id, kind, body, ref_event, ref_item, file) on public.messages to authenticated;

-- Where each user last read each chat, for unread badges.
create table public.chat_reads (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  chat_key text not null check (chat_key ~ '^(thread|event|team):[0-9a-f-]{36}$'),
  read_at timestamptz not null default now(),
  primary key (user_id, chat_key)
);

alter table public.chat_reads enable row level security;
create policy "Own read markers" on public.chat_reads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.chat_reads from anon, authenticated;
grant select, insert, update on public.chat_reads to authenticated;

create function public.mark_read(p_chat_key text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.chat_reads (user_id, chat_key, read_at)
  values (auth.uid(), p_chat_key, now())
  on conflict (user_id, chat_key) do update set read_at = excluded.read_at;
$$;
revoke all on function public.mark_read(text) from public, anon;
grant execute on function public.mark_read(text) to authenticated;

-- My chats with their last message and unread count: followed threads,
-- events I'm going to or host, and my teams. Invoker rights, so RLS on
-- messages still decides what's counted.
create function public.my_chats()
returns table (
  chat_key text,
  kind text,
  id uuid,
  last_at timestamptz,
  last_user text,
  last_user_id uuid,
  last_kind text,
  last_body text,
  last_ref_event uuid,
  last_ref_item uuid,
  last_file jsonb,
  unread integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select 'thread'::text as kind, f.thread_id as id from public.follows f where f.user_id = auth.uid()
    union
    select 'event', g.event_id from public.going g where g.user_id = auth.uid() and g.status = 'going'
    union
    select 'event', e.id from public.events e where e.host_id = auth.uid()
    union
    select 'team', m.team_id from public.team_members m where m.user_id = auth.uid()
  )
  select
    mine.kind || ':' || mine.id,
    mine.kind,
    mine.id,
    last.created_at,
    p.username,
    last.user_id,
    last.kind,
    last.body,
    last.ref_event,
    last.ref_item,
    last.file,
    (
      select count(*)::int from public.messages m
      where (case mine.kind when 'thread' then m.thread_id when 'event' then m.event_id else m.team_id end) = mine.id
        and m.user_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.read_at from public.chat_reads r where r.user_id = auth.uid() and r.chat_key = mine.kind || ':' || mine.id),
          '-infinity'::timestamptz)
    )
  from mine
  left join lateral (
    select m.* from public.messages m
    where (case mine.kind when 'thread' then m.thread_id when 'event' then m.event_id else m.team_id end) = mine.id
    order by m.created_at desc
    limit 1
  ) last on true
  left join public.profiles p on p.id = last.user_id;
$$;
revoke all on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

-- Threads with member counts and how many people wrote today (the mockup's
-- "online"), for Explore. Threads are public, so definer rights are fine.
create function public.thread_stats()
returns table (thread_id uuid, members integer, active_today integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
    t.seed_members + (select count(*)::int from public.follows f where f.thread_id = t.id),
    t.seed_active + (select count(distinct m.user_id)::int from public.messages m
      where m.thread_id = t.id and m.created_at > now() - interval '24 hours')
  from public.threads t;
$$;
revoke all on function public.thread_stats() from public, anon;
grant execute on function public.thread_stats() to authenticated;

-- ------------------------------------------------------------------ storage

insert into storage.buckets (id, name, public) values ('event-images', 'event-images', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('team-files', 'team-files', false)
on conflict (id) do nothing;

-- event-images/<user id>/<file>: anyone signed in uploads into their folder.
create policy "Upload event images to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own event images" on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- team-files/<team id>/<file>: team members only.
create policy "Team members read team files" on storage.objects for select to authenticated
  using (bucket_id = 'team-files' and private.is_team_member(((storage.foldername(name))[1])::uuid, (select auth.uid())));
create policy "Team members upload team files" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-files' and private.is_team_member(((storage.foldername(name))[1])::uuid, (select auth.uid())));

-- ----------------------------------------------------------------- realtime

alter publication supabase_realtime add table public.messages, public.going, public.events;

-- Helpers are for policies and our own functions only.
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- First name and a short last name ("Paweł Śli"), shown on people instead of
-- the username. Only the first three letters of the last name are ever
-- stored, so the full name never reaches the database.

alter table public.profiles
  add column first_name text
    constraint profiles_first_name_length check (char_length(btrim(first_name)) between 1 and 30),
  add column last_short text
    constraint profiles_last_short_length check (char_length(btrim(last_short)) between 1 and 3),
  add column display_name text generated always as (
    case when first_name is null then null else btrim(first_name) || coalesce(' ' || btrim(last_short), '') end
  ) stored;

grant update (first_name, last_short) on public.profiles to authenticated;

-- Chat previews name people the same way.
create or replace function public.my_chats()
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
    coalesce(p.display_name, p.username),
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

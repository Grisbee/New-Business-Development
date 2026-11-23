-- Performance (review): indexes on hot and cascade paths, my_chats able
-- to use them, fewer broadcast updates, cheaper team policies, bucket
-- limits for event photos.

-- my_chats: one index for "messages of a chat", whichever kind it is
-- (messages_one_channel guarantees exactly one of the ids is set).
create index messages_chat_idx on public.messages ((coalesce(thread_id, event_id, team_id)), created_at desc);
create index events_host_idx on public.events (host_id);
create index messages_ref_event_idx on public.messages (ref_event) where ref_event is not null;
create index messages_ref_item_idx on public.messages (ref_item) where ref_item is not null;
create index messages_user_idx on public.messages (user_id);
create index notifications_event_idx on public.notifications (event_id) where event_id is not null;
create index notifications_actor_idx on public.notifications (actor_id);
create index uni_items_user_idx on public.uni_items (user_id);
create index uni_items_team_idx on public.uni_items (team_id) where team_id is not null;
create index going_requested_idx on public.going (event_id) where status = 'requested';
create unique index threads_name_unique on public.threads (lower(name));

-- Definer is safe here: `mine` lists exactly the chats the caller may read
-- (followed threads, events they're in or host, their teams).
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
security definer
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
      -- Capped: the badge shows 99+ beyond that.
      select count(*)::int from (
        select 1 from public.messages m
        where coalesce(m.thread_id, m.event_id, m.team_id) = mine.id
          and m.user_id <> auth.uid()
          and m.created_at > coalesce(
            (select r.read_at from public.chat_reads r where r.user_id = auth.uid() and r.chat_key = mine.kind || ':' || mine.id),
            '-infinity'::timestamptz)
        limit 100
      ) x
    )
  from mine
  left join lateral (
    select m.* from public.messages m
    where coalesce(m.thread_id, m.event_id, m.team_id) = mine.id
    order by m.created_at desc
    limit 1
  ) last on true
  left join public.profiles p on p.id = last.user_id;
$$;

create or replace function private.after_going_change()
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

  -- Only when it changed: an events UPDATE is broadcast to every client.
  update public.events ev
  set going_count = ev.seed_going + coalesce((
    select sum(qty) from public.going where event_id = v_event and status = 'going'
  ), 0)
  where ev.id = v_event
    and ev.going_count is distinct from ev.seed_going + coalesce((
      select sum(qty) from public.going where event_id = v_event and status = 'going'
    ), 0);
  return null;
end;
$$;

-- Edits: only the columns that matter, and only real increases in spots.
drop trigger events_after_update on public.events;
create or replace function private.after_event_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken integer;
  free integer;
begin
  if new.kind = 'community' and old.max_going is not null
     and (new.max_going is null or new.max_going > old.max_going) then
    select count(*) into taken from public.going where event_id = new.id and status = 'going';
    free := case when new.max_going is null then 1000000 else new.max_going - 1 - new.seed_going - taken end;
    if free > 0 then
      update public.going g set status = 'going'
      where g.event_id = new.id and g.user_id in (
        select user_id from public.going where event_id = new.id and status = 'waitlist' order by created_at limit free
      );
    end if;
  end if;

  if (new.starts_on, new.starts_at, new.place, new.repeat, new.repeat_until) is distinct from
     (old.starts_on, old.starts_at, old.place, old.repeat, old.repeat_until) then
    insert into public.notifications (user_id, type, event_id, actor_id)
    select g.user_id, 'event_updated', new.id, new.host_id
    from public.going g
    where g.event_id = new.id and g.status in ('going', 'waitlist') and g.user_id <> new.host_id;
  end if;
  return null;
end;
$$;
create trigger events_after_update
after update of max_going, starts_on, starts_at, place, repeat, repeat_until on public.events
for each row execute function private.after_event_update();

-- Team policies: my teams once per query, not a helper call per row.
create function private.my_team_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;
revoke all on function private.my_team_ids() from public, anon;
grant execute on function private.my_team_ids() to authenticated;

drop policy "Members see their teams" on public.teams;
create policy "Members see their teams" on public.teams for select to authenticated
  using (id in (select private.my_team_ids()));
drop policy "Members see their teammates" on public.team_members;
create policy "Members see their teammates" on public.team_members for select to authenticated
  using (team_id in (select private.my_team_ids()));
drop policy "Own items and team deadlines" on public.uni_items;
create policy "Own items and team deadlines" on public.uni_items for select to authenticated
  using (user_id = (select auth.uid()) or team_id in (select private.my_team_ids()));

-- Admin checks once per query.
drop policy "Users see their own requests; admins see all" on public.venue_requests;
create policy "Users see their own requests; admins see all" on public.venue_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin((select auth.uid()))));
drop policy "Hosts and admins delete events" on public.events;
create policy "Hosts and admins delete events" on public.events for delete to authenticated
  using (host_id = (select auth.uid()) or (select private.is_admin((select auth.uid()))));

-- Event photos: limits enforced by Storage, not just the client.
update storage.buckets
set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
where id = 'event-images';

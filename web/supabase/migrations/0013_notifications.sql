-- Notifications (the bell): join requests on your events, answers to your
-- requests, someone joining your event, a waitlist spot opening up, and the
-- answer to a venue request. Written only by triggers and our functions.

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  type text not null check (type in ('join_request', 'request_approved', 'request_declined', 'joined', 'waitlist_promoted', 'venue_approved', 'venue_rejected')),
  event_id uuid references public.events on delete cascade,
  actor_id uuid references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "Own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "Mark own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Clear own notifications" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create function private.notify_going()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_kind text;
begin
  select host_id, kind into v_host, v_kind from public.events where id = coalesce(new.event_id, old.event_id);
  if v_host is null then
    return null;
  end if;

  if tg_op = 'INSERT' and new.user_id <> v_host then
    if new.status = 'requested' then
      insert into public.notifications (user_id, type, event_id, actor_id) values (v_host, 'join_request', new.event_id, new.user_id);
    elsif new.status = 'going' and v_kind = 'community' then
      insert into public.notifications (user_id, type, event_id, actor_id) values (v_host, 'joined', new.event_id, new.user_id);
    end if;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.status = 'requested' and new.status in ('going', 'waitlist') then
      insert into public.notifications (user_id, type, event_id, actor_id) values (new.user_id, 'request_approved', new.event_id, v_host);
    elsif old.status = 'waitlist' and new.status = 'going' then
      insert into public.notifications (user_id, type, event_id, actor_id) values (new.user_id, 'waitlist_promoted', new.event_id, v_host);
    end if;
  end if;
  return null;
end;
$$;

create trigger going_notify
after insert or update of status on public.going
for each row execute function private.notify_going();

-- Declining deletes the request, so the notice is written here.
create or replace function public.answer_join_request(p_event uuid, p_user uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  taken integer;
  v_status text;
begin
  select * into e from public.events where id = p_event for update;
  if not found or e.host_id <> auth.uid() then
    raise exception 'Only the host answers requests' using errcode = '42501';
  end if;
  if not exists (select 1 from public.going where event_id = p_event and user_id = p_user and status = 'requested') then
    raise exception 'No such request' using errcode = 'P0002';
  end if;

  if not p_approve then
    delete from public.going where event_id = p_event and user_id = p_user;
    insert into public.notifications (user_id, type, event_id, actor_id) values (p_user, 'request_declined', p_event, auth.uid());
    return 'declined';
  end if;

  select count(*) into taken from public.going where event_id = p_event and status = 'going';
  v_status := case when e.seed_going + taken + 1 >= e.max_going then 'waitlist' else 'going' end;
  update public.going set status = v_status where event_id = p_event and user_id = p_user;
  return v_status;
end;
$$;

create function private.notify_venue_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> old.status and new.status in ('approved', 'rejected') then
    insert into public.notifications (user_id, type, actor_id)
    values (new.user_id, case when new.status = 'approved' then 'venue_approved' else 'venue_rejected' end, new.reviewed_by);
  end if;
  return null;
end;
$$;

create trigger venue_requests_notify
after update of status on public.venue_requests
for each row execute function private.notify_venue_review();

revoke all on function private.notify_going(), private.notify_venue_review() from public, anon;

alter publication supabase_realtime add table public.notifications;

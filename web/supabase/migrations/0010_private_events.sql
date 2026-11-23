-- Private community events: people ask to join and the host approves.
-- A request is a going row with status 'requested'; it doesn't count, give
-- chat access or hold a spot until the host approves it.

alter table public.events
  add column join_mode text not null default 'open'
    constraint events_join_mode check (join_mode in ('open', 'approval')),
  add constraint events_approval_community check (join_mode = 'open' or kind = 'community');

grant insert (join_mode), update (join_mode) on public.events to authenticated;

alter table public.going drop constraint going_status_check;
alter table public.going add constraint going_status_check check (status in ('going', 'waitlist', 'requested'));

create or replace function private.before_join()
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
    if e.join_mode = 'approval' and new.user_id <> e.host_id then
      new.status := 'requested';
      return new;
    end if;
    select count(*) into taken from public.going where event_id = e.id and status = 'going';
    -- The host counts as one of the spots.
    new.status := case when e.seed_going + taken + 1 >= e.max_going then 'waitlist' else 'going' end;
  end if;
  return new;
end;
$$;

-- The host answers a request. Approving takes a spot (or the waitlist when
-- the event is full); declining removes the request.
create function public.answer_join_request(p_event uuid, p_user uuid, p_approve boolean)
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
    return 'declined';
  end if;

  select count(*) into taken from public.going where event_id = p_event and status = 'going';
  v_status := case when e.seed_going + taken + 1 >= e.max_going then 'waitlist' else 'going' end;
  update public.going set status = v_status where event_id = p_event and user_id = p_user;
  return v_status;
end;
$$;

revoke all on function public.answer_join_request(uuid, uuid, boolean) from public, anon;
grant execute on function public.answer_join_request(uuid, uuid, boolean) to authenticated;

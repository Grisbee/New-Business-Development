-- Bug review fixes:
-- - switching an event from approval to open settles pending requests;
-- - one-off events that are over can't be joined.

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

  -- Approval → open: pending requests become joins (waitlist when full),
  -- oldest first, instead of waiting for an answer that can't come.
  if old.join_mode = 'approval' and new.join_mode = 'open' then
    update public.going g set status = case
        when new.max_going is null then 'going'
        when (select count(*) from public.going x where x.event_id = new.id and x.status = 'going')
             + new.seed_going + 1 < new.max_going then 'going'
        else 'waitlist' end
    where g.event_id = new.id and g.status = 'requested';
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
drop trigger events_after_update on public.events;
create trigger events_after_update
after update of max_going, starts_on, starts_at, place, repeat, repeat_until, join_mode on public.events
for each row execute function private.after_event_update();

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
  -- A one-off event that's over can't be joined.
  if e.repeat = 'none' and e.starts_on < (now() at time zone 'Asia/Taipei')::date then
    raise exception 'This event is over' using errcode = '23514';
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

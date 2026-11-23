-- Editing events: raising the spots moves people up from the waitlist
-- (oldest first), and everyone in the event hears about the change.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('join_request', 'request_approved', 'request_declined', 'joined', 'waitlist_promoted', 'venue_approved', 'venue_rejected', 'event_cancelled', 'event_updated'));

create function private.after_event_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken integer;
  free integer;
begin
  -- More spots (or unlimited): fill them from the waitlist.
  if new.kind = 'community' and (new.max_going is null or new.max_going > coalesce(old.max_going, 0)) then
    select count(*) into taken from public.going where event_id = new.id and status = 'going';
    free := case when new.max_going is null then 1000000 else new.max_going - 1 - new.seed_going - taken end;
    if free > 0 then
      update public.going g set status = 'going'
      where g.event_id = new.id and g.user_id in (
        select user_id from public.going where event_id = new.id and status = 'waitlist' order by created_at limit free
      );
    end if;
  end if;

  -- Date, time or place changed: tell everyone in it.
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
after update on public.events
for each row execute function private.after_event_update();

revoke all on function private.after_event_update() from public, anon;

-- Deleting an event tells everyone who was going, waiting or asking. The
-- event row is gone afterwards, so the notice keeps the title itself.

alter table public.notifications add column event_title text;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('join_request', 'request_approved', 'request_declined', 'joined', 'waitlist_promoted', 'venue_approved', 'venue_rejected', 'event_cancelled'));

create function private.notify_event_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, event_id, event_title, actor_id)
  select g.user_id, 'event_cancelled', null, old.title, old.host_id
  from public.going g
  where g.event_id = old.id and g.user_id <> old.host_id;
  return old;
end;
$$;

create trigger events_notify_cancelled
before delete on public.events
for each row execute function private.notify_event_cancelled();

revoke all on function private.notify_event_cancelled() from public, anon;

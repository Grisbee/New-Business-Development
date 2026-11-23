-- Community events can repeat (weekly, every two weeks, monthly), optionally
-- until a date. One event, one chat and one "going" list for the whole
-- series; the app shows the next date and every date in the calendar.

alter table public.events
  add column repeat text not null default 'none'
    constraint events_repeat_kind check (repeat in ('none', 'weekly', 'biweekly', 'monthly')),
  add column repeat_until date,
  add constraint events_repeat_community check (repeat = 'none' or kind = 'community'),
  add constraint events_repeat_until_after check (repeat_until is null or repeat_until >= starts_on);

grant insert (repeat, repeat_until), update (repeat, repeat_until) on public.events to authenticated;

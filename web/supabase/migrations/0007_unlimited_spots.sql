-- Community events can have unlimited spots: max_going null. Joining then
-- never lands on the waitlist (the capacity check compares with null).

alter table public.events drop constraint events_community_has_max;

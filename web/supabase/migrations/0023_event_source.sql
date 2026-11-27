-- Events listed from elsewhere: a link to the organiser's page (tickets
-- and details live there, so the dummy booking is skipped) and the credit
-- a freely licensed cover photo requires.
alter table public.events
  add column source_url text check (source_url is null or (source_url ~ '^https://' and char_length(source_url) <= 500)),
  add column image_credit text check (char_length(image_credit) <= 200);
grant insert (source_url), update (source_url) on public.events to authenticated;

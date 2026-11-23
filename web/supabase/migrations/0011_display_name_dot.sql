-- Short names end with a dot: "Paweł Śli.", so it reads as cut short.

alter table public.profiles drop column display_name;
alter table public.profiles add column display_name text generated always as (
  case when first_name is null then null
       else btrim(first_name) || coalesce(' ' || btrim(last_short) || '.', '') end
) stored;

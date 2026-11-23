-- Team join codes become 6-digit PINs (easier to read out in class).

alter table public.teams alter column join_code set default lpad(floor(random() * 1000000)::int::text, 6, '0');

update public.teams set join_code = lpad(floor(random() * 1000000)::int::text, 6, '0');

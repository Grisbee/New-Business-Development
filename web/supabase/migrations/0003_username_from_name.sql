-- The username is made from the short name ("John Smi" → john.smi) and can't
-- be typed in: one less thing to pick, and nobody poses as someone else.
-- Taken ones get a number (john.smi2).

create extension if not exists unaccent with schema extensions;

create function private.username_for(p_first text, p_last text, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  base := lower(extensions.unaccent(btrim(p_first)));
  if p_last is not null and btrim(p_last) <> '' then
    base := base || '.' || lower(extensions.unaccent(btrim(p_last)));
  end if;
  base := regexp_replace(regexp_replace(base, '[^a-z0-9.]+', '', 'g'), '\.+', '.', 'g');
  base := btrim(base, '.');
  if char_length(base) < 3 then
    base := rpad(coalesce(nullif(base, ''), 'user'), 3, '0');
  end if;
  base := left(base, 17);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate and id <> p_user) loop
    n := n + 1;
    candidate := base || n;
  end loop;
  return candidate;
end;
$$;

create function private.set_username_from_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.first_name is not null
     and (new.username is null
          or new.first_name is distinct from old.first_name
          or new.last_short is distinct from old.last_short) then
    new.username := private.username_for(new.first_name, new.last_short, new.id);
  end if;
  return new;
end;
$$;

create trigger profiles_username_from_name
before update on public.profiles
for each row execute function private.set_username_from_name();

revoke all on function private.username_for(text, text, uuid) from public, anon;
revoke all on function private.set_username_from_name() from public, anon;

-- No longer typed in.
revoke update (username) on public.profiles from authenticated;

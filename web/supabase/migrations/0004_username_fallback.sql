-- Short or non-Latin names got a cut-off handle ("use"); now "user", "user2"…

create or replace function private.username_for(p_first text, p_last text, p_user uuid)
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
  -- Names without Latin letters (李) still get a usable handle.
  if char_length(base) < 3 then
    base := base || 'user';
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


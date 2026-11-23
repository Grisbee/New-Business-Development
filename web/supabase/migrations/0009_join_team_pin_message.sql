-- join_team says "PIN" now that join codes are PINs.

create or replace function public.join_team(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select id into v_team from public.teams where join_code = upper(btrim(p_code));
  if v_team is null then
    raise exception 'No team with that PIN' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team, auth.uid())
  on conflict do nothing;
  return v_team;
end;
$$;

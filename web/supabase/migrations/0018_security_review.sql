-- Security review fixes.

-- 1. Team PINs can't be brute-forced: 10 wrong tries an hour per person.
--    A wrong PIN returns null (raising would roll back the logged try).
--    The creator can change the PIN and remove members.
create table private.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index join_attempts_user_idx on private.join_attempts (user_id, at);

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
  if (select count(*) from private.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong PINs. Try again in an hour.' using errcode = 'P0001';
  end if;
  select id into v_team from public.teams where join_code = btrim(p_code);
  if v_team is null then
    insert into private.join_attempts (user_id) values (auth.uid());
    return null;
  end if;
  insert into public.team_members (team_id, user_id) values (v_team, auth.uid()) on conflict do nothing;
  return v_team;
end;
$$;

create function private.new_team_pin()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v text;
begin
  loop
    v := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.teams where join_code = v);
  end loop;
  return v;
end;
$$;
revoke all on function private.new_team_pin() from public, anon;
alter table public.teams alter column join_code set default private.new_team_pin();

create function public.rotate_team_pin(p_team uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  if not exists (select 1 from public.teams where id = p_team and created_by = auth.uid()) then
    raise exception 'Only the team''s creator changes its PIN' using errcode = '42501';
  end if;
  v := private.new_team_pin();
  update public.teams set join_code = v where id = p_team;
  return v;
end;
$$;

create function public.remove_team_member(p_team uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.teams where id = p_team and created_by = auth.uid()) or p_user = auth.uid() then
    raise exception 'Only the team''s creator removes members' using errcode = '42501';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
end;
$$;
revoke all on function public.rotate_team_pin(uuid), public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.rotate_team_pin(uuid), public.remove_team_member(uuid, uuid) to authenticated;

-- 2. Taking over imported content needs a confirmed email.
create or replace function public.claim_imported_account()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_hash text;
  v_standin uuid;
begin
  if v_me is null then
    return 0;
  end if;
  select encode(extensions.digest(lower(email), 'sha256'), 'hex') into v_hash
  from auth.users where id = v_me and email_confirmed_at is not null;
  if v_hash is null then
    return 0;
  end if;
  select standin into v_standin from private.imported_accounts where email_hash = v_hash;
  if v_standin is null or v_standin = v_me then
    return 0;
  end if;

  set local session_replication_role = replica;
  update public.events set host_id = v_me where host_id = v_standin;
  update public.going g set user_id = v_me where g.user_id = v_standin
    and not exists (select 1 from public.going x where x.event_id = g.event_id and x.user_id = v_me);
  update public.follows f set user_id = v_me where f.user_id = v_standin
    and not exists (select 1 from public.follows x where x.thread_id = f.thread_id and x.user_id = v_me);
  update public.messages set user_id = v_me where user_id = v_standin;
  update public.team_members t set user_id = v_me where t.user_id = v_standin
    and not exists (select 1 from public.team_members x where x.team_id = t.team_id and x.user_id = v_me);
  update public.uni_items set user_id = v_me where user_id = v_standin;
  set local session_replication_role = origin;

  delete from private.imported_accounts where email_hash = v_hash;
  delete from auth.users where id = v_standin;
  return 1;
end;
$$;

-- Stand-ins exist to hold content until claimed; nobody logs in as them.
update auth.users set banned_until = 'infinity'
where id in (select standin from private.imported_accounts);

-- 3. Event photos: a demo key or a file in the host's own folder, nothing
--    else (no external URLs pulled into everyone's browser).
alter table public.events add constraint events_image_format check (
  image is null
  or image ~ '^demo:[a-z0-9]{1,8}$'
  or (image ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,4}$' and split_part(image, '/', 1) = host_id::text)
);

-- 4. Size limits enforced by Storage.
update storage.buckets set file_size_limit = 20971520 where id = 'team-files';

-- 5. Bounded inputs.
alter table public.threads add constraint threads_tag_length check (char_length(tag) <= 30),
  add constraint threads_icon_length check (char_length(icon) <= 20);
alter table public.teams add constraint teams_icon_length check (char_length(icon) <= 20);
alter table public.messages add constraint messages_file_size check (file is null or pg_column_size(file) < 2048);
alter table public.events add constraint events_tickets_size check (pg_column_size(tickets) < 4096);

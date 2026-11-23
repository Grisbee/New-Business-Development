-- Anyone can start a thread (and follows it at once), and a thread's chat is
-- only readable by its followers: you join to see it.

drop policy "Admins create threads" on public.threads;

create function public.create_thread(p_name text, p_tag text, p_icon text, p_color text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from public.threads where lower(name) = lower(btrim(p_name))) then
    raise exception 'A thread with that name already exists' using errcode = '23505';
  end if;
  insert into public.threads (name, tag, icon, color, created_by)
  values (btrim(p_name), p_tag, coalesce(nullif(p_icon, ''), 'users'), coalesce(nullif(p_color, ''), '#8FC1E3'), auth.uid())
  returning id into v_thread;
  insert into public.follows (thread_id, user_id) values (v_thread, auth.uid());
  return v_thread;
end;
$$;

revoke all on function public.create_thread(text, text, text, text) from public, anon;
grant execute on function public.create_thread(text, text, text, text) to authenticated;
revoke insert on public.threads from authenticated;

drop policy "Read chats you can see" on public.messages;
create policy "Read chats you belong to" on public.messages for select to authenticated
  using (
    (thread_id is not null and private.follows_thread(thread_id, (select auth.uid())))
    or (event_id is not null and private.is_event_member(event_id, (select auth.uid())))
    or (team_id is not null and private.is_team_member(team_id, (select auth.uid())))
  );

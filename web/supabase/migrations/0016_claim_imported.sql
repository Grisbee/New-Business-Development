-- People imported from Sidequest appear under stand-in accounts. When they
-- sign up here with the same email, their events, chats and follows move to
-- the new account and the stand-in goes away. Only a hash of their old
-- email is kept (never the email itself), in a schema the API can't reach.

create table private.imported_accounts (
  email_hash text primary key,
  standin uuid not null references auth.users on delete cascade
);

create function public.claim_imported_account()
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
  select encode(extensions.digest(lower(email), 'sha256'), 'hex') into v_hash from auth.users where id = v_me;
  select standin into v_standin from private.imported_accounts where email_hash = v_hash;
  if v_standin is null or v_standin = v_me then
    return 0;
  end if;

  -- No join notices or waitlist moves while moving rows over.
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

revoke all on function public.claim_imported_account() from public, anon;
grant execute on function public.claim_imported_account() to authenticated;

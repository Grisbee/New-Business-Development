-- SideQuest schema. Safe to re-run: drops and recreates the app tables (not auth users).
drop table if exists messages, uni_items, attendance, follows, events, profiles cascade;

create table profiles(
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  tag text not null default 'NTUST'
);

create table events(
  id text primary key default 'u'||substr(md5(random()::text),1,8),
  kind text not null check (kind in ('public','community')),
  img text,
  thread text,
  tag text,
  date date not null,
  time text,
  title text not null,
  place text,
  price int default 0,
  venue text,
  host text,
  host_tag text,
  color text,
  base_going int not null default 0,
  max int,
  descr text,
  tickets jsonb not null default '[]',
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

create table attendance(
  event_id text references events on delete cascade,
  user_id uuid references profiles on delete cascade default auth.uid(),
  tier int,
  qty int,
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table follows(
  thread_id text,
  user_id uuid references profiles on delete cascade default auth.uid(),
  primary key(thread_id,user_id)
);

-- channel: 'thread:<id>' | 'event:<id>' | 'team:<id>'
create table messages(
  id bigint generated always as identity primary key,
  channel text not null,
  username text not null default '',
  user_id uuid references profiles on delete cascade default auth.uid(),
  body text,
  payload jsonb,
  is_host boolean not null default false,
  created_at timestamptz not null default now()
);
create index on messages(channel, created_at);

-- team deadlines are shared; exams/other items are personal (user_id set, team null);
-- seeded items have no user and act as the shared course schedule
create table uni_items(
  id text primary key default 'n'||substr(md5(random()::text),1,8),
  kind text not null,
  team text,
  course text,
  title text not null,
  date date not null,
  time text,
  place text,
  user_id uuid references profiles on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

-- the sender's name comes from their profile so nobody can post as someone else
create or replace function set_username() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null then
    new.username := (select username from profiles where id=auth.uid());
  end if;
  return new;
end $$;
create trigger messages_username before insert on messages for each row execute function set_username();

-- explicit grants, in case the project was created with "Automatically expose new tables" off; RLS below still decides per row
grant usage on schema public to authenticated;
grant select on profiles to authenticated;
grant select, insert, delete on events, attendance, follows to authenticated;
grant select, insert on messages, uni_items to authenticated;

alter table profiles enable row level security;
alter table events enable row level security;
alter table attendance enable row level security;
alter table follows enable row level security;
alter table messages enable row level security;
alter table uni_items enable row level security;

create policy read on profiles for select to authenticated using (true);
create policy read on events for select to authenticated using (true);
create policy own_insert on events for insert to authenticated with check (created_by=auth.uid() and kind='community');
create policy own_delete on events for delete to authenticated using (created_by=auth.uid());
create policy read on attendance for select to authenticated using (true);
create policy own_insert on attendance for insert to authenticated with check (user_id=auth.uid());
create policy own_delete on attendance for delete to authenticated using (user_id=auth.uid());
create policy read on follows for select to authenticated using (true);
create policy own_insert on follows for insert to authenticated with check (user_id=auth.uid());
create policy own_delete on follows for delete to authenticated using (user_id=auth.uid());
create policy read on messages for select to authenticated using (true);
create policy own_insert on messages for insert to authenticated with check (user_id=auth.uid());
create policy read on uni_items for select to authenticated using (team is not null or user_id is null or user_id=auth.uid());
create policy own_insert on uni_items for insert to authenticated with check (user_id=auth.uid());

-- live updates
do $$ begin
  alter publication supabase_realtime add table events, attendance, follows, messages, uni_items;
exception when others then null; end $$;

-- shared files from team chats
insert into storage.buckets(id,name,public) values ('files','files',true) on conflict (id) do nothing;
drop policy if exists sq_files_insert on storage.objects;
create policy sq_files_insert on storage.objects for insert to authenticated with check (bucket_id='files');

-- Photos in every chat (thread, event, team). The file sits in the private
-- chat-images bucket under <thread|event|team>/<chat id>/…, readable and
-- writable by exactly the people who can read and write that chat.

alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'event', 'file', 'deadline', 'image'));

alter table public.messages drop constraint messages_kind_payload;
alter table public.messages add constraint messages_kind_payload check (
  (kind = 'text' and body is not null and char_length(btrim(body)) > 0)
  or (kind = 'event' and ref_event is not null)
  or (kind = 'deadline' and ref_item is not null and team_id is not null)
  or (kind = 'file' and file is not null and team_id is not null)
  or (kind = 'image' and file is not null)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do nothing;

create function private.can_use_chat(p_kind text, p_id text, p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    v_id := p_id::uuid;
  exception when others then
    return false;
  end;
  return case p_kind
    when 'thread' then private.follows_thread(v_id, p_user)
    when 'event' then private.is_event_member(v_id, p_user)
    when 'team' then private.is_team_member(v_id, p_user)
    else false
  end;
end;
$$;
revoke all on function private.can_use_chat(text, text, uuid) from public, anon;
grant execute on function private.can_use_chat(text, text, uuid) to authenticated;

create policy "Chat members read chat photos" on storage.objects for select to authenticated
  using (bucket_id = 'chat-images' and private.can_use_chat((storage.foldername(name))[1], (storage.foldername(name))[2], (select auth.uid())));
create policy "Chat members upload chat photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and private.can_use_chat((storage.foldername(name))[1], (storage.foldername(name))[2], (select auth.uid())));

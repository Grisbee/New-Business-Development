-- Profile photos: avatars/<user id>/<file> in a public bucket, the path
-- kept on the profile. Only the owner writes their folder and column.

alter table public.profiles add column avatar text;
alter table public.profiles add constraint profiles_avatar_own_folder
  check (avatar is null or (avatar ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' and split_part(avatar, '/', 1) = id::text));
grant update (avatar) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

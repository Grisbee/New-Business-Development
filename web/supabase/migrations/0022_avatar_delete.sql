-- Storage only deletes what the caller can also select: owners need to
-- see their own avatar files for "Remove" and replacing to clean up.
create policy "Read own avatar files" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

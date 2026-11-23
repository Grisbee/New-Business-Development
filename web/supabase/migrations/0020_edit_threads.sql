-- Thread creators (and admins) can edit name, topic, icon and colour.

create policy "Creators and admins edit threads" on public.threads for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin((select auth.uid()))))
  with check (created_by = (select auth.uid()) or (select private.is_admin((select auth.uid()))));

grant update (name, tag, icon, color) on public.threads to authenticated;

-- Images in playbook steps (screenshots, photos). Private bucket: anyone signed in
-- can view (through signed URLs); only the department's team (and admins) can
-- upload or remove. Files live at "<department_id>/<random>.<ext>"; each step
-- keeps their paths in playbooks.steps[].images.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playbooks', 'playbooks', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "playbook images: read" on storage.objects for select to authenticated
  using (bucket_id = 'playbooks');
create policy "playbook images: team uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'playbooks' and (public.in_department((storage.foldername(name))[1]) or public.is_admin()));
create policy "playbook images: team removes" on storage.objects for delete to authenticated
  using (bucket_id = 'playbooks' and (public.in_department((storage.foldername(name))[1]) or public.is_admin()));

commit;

-- Official brand kit files (brand guides, logo packs). Private bucket: anyone
-- signed in can open them through /brand-kit/<path> (short-lived signed URL);
-- only admins and the Marketing team can add or remove files.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-kit', 'brand-kit', false, 52428800,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'application/zip'])
on conflict (id) do nothing;

create policy "brand kit: read" on storage.objects for select to authenticated
  using (bucket_id = 'brand-kit');
create policy "brand kit: marketing uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-kit' and (public.is_admin() or public.in_department('marketing')));
create policy "brand kit: marketing removes" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-kit' and (public.is_admin() or public.in_department('marketing')));

commit;

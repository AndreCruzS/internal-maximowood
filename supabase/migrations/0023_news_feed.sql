-- News as a feed: three importance levels, comments, and photos uploaded with a post.
--   * news.priority: 'update' (regular), 'important' (highlighted), 'critical'
--     (must read: everyone is asked to confirm). must_read now follows priority.
--   * news_comments: anyone signed in comments; you remove your own, and the
--     post's managers (and admins) can remove any.
--   * Private bucket "news" for post photos, at "<user_id>/<file>"; people who can
--     post (admins and leaders) upload; everyone signed in can view.

begin;

alter table public.news
  add column if not exists priority text not null default 'update' check (priority in ('update', 'important', 'critical'));
update public.news set priority = 'critical' where must_read and priority = 'update';

create or replace function public.news_priority_sync() returns trigger
language plpgsql set search_path = public as $$
begin
  new.must_read := new.priority = 'critical';
  return new;
end;
$$;
drop trigger if exists news_priority_sync on public.news;
create trigger news_priority_sync before insert or update on public.news
  for each row execute function public.news_priority_sync();

create table if not exists public.news_comments (
  id         uuid primary key default gen_random_uuid(),
  news_id    uuid not null references public.news (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists news_comments_news_idx on public.news_comments (news_id, created_at);

alter table public.news_comments enable row level security;
revoke all on public.news_comments from anon, authenticated;
grant select, insert, delete on public.news_comments to authenticated;

drop policy if exists "read comments" on public.news_comments;
drop policy if exists "add comment" on public.news_comments;
drop policy if exists "remove comment" on public.news_comments;
create policy "read comments" on public.news_comments for select to authenticated using (true);
create policy "add comment" on public.news_comments for insert to authenticated with check (user_id = auth.uid());
create policy "remove comment" on public.news_comments for delete to authenticated using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (select 1 from public.news n where n.id = news_comments.news_id and public.can_manage(n.department_id))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news', 'news', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "news images: read" on storage.objects;
drop policy if exists "news images: posters upload" on storage.objects;
drop policy if exists "news images: remove own" on storage.objects;
create policy "news images: read" on storage.objects for select to authenticated
  using (bucket_id = 'news');
create policy "news images: posters upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'news' and (storage.foldername(name))[1] = auth.uid()::text
    and (public.is_admin() or public.my_role() = 'leader'));
create policy "news images: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'news' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

commit;

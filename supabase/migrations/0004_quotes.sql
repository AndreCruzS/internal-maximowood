-- Saved quotes. One row per project per salesperson: the project name is the
-- quote's identity, so re-saving the same project updates the row instead of
-- creating a second quote.
--
-- Unlike the tables in 0003, the app reads and writes this one with the
-- signed-in user's session (anon key + JWT via src/lib/supabase/server.ts), so
-- RLS is what keeps each salesperson to their own quotes.

begin;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_name text not null check (length(btrim(project_name)) > 0),
  calculator text not null default 'retail' check (calculator in ('retail', 'b2b')),
  company text,
  contact text,
  address text,
  prepared_by text,
  notes text,
  tax numeric(12, 2),
  shipping numeric(12, 2),
  -- QuoteCartItem[] exactly as the calculator builds it (src/components/QuoteModal.tsx)
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  -- Sum of item totals + add-ons, before tax/shipping. Computed by the API.
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Deck — Main St" and "deck — main st " are the same project.
create unique index if not exists quotes_user_project_name_key
  on public.quotes (user_id, lower(btrim(project_name)));

create index if not exists quotes_user_updated_at_idx
  on public.quotes (user_id, updated_at desc);

create or replace function public.quotes_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quotes_set_updated_at on public.quotes;

create trigger quotes_set_updated_at
before update on public.quotes
for each row
execute function public.quotes_set_updated_at();

alter table public.quotes enable row level security;

revoke all on public.quotes from anon, authenticated;
grant select, insert, update, delete on public.quotes to authenticated;

drop policy if exists "quotes_select_own" on public.quotes;
create policy "quotes_select_own" on public.quotes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "quotes_insert_own" on public.quotes;
create policy "quotes_insert_own" on public.quotes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "quotes_update_own" on public.quotes;
create policy "quotes_update_own" on public.quotes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "quotes_delete_own" on public.quotes;
create policy "quotes_delete_own" on public.quotes
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;

-- Sales checklists (Maximo Concierge "Client Approval Checklist"), what sales sends logistics once
-- the customer approves a quote. Used by both the calculator app and the intranet.
--   * One checklist per quote: "Customer approved" on a saved quote creates it, pre-filled from the
--     quote, and stamps quotes.customer_approved_at. A checklist can also start blank (quote_id null).
--   * data = the form (src/lib/checklist.ts), photos included as small data URLs.
--   * Like quotes: each salesperson sees their own; admins use the service role and see all.
--   * status 'sent' = the rep marked it sent to logistics (the PDF goes out by email for now).

begin;

alter table public.quotes add column if not exists customer_approved_at timestamptz;

create table if not exists public.sales_checklists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id    uuid references public.quotes (id) on delete set null,
  title       text not null default '' check (length(title) <= 200),
  status      text not null default 'draft' check (status in ('draft', 'sent')),
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 6000000),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists sales_checklists_quote_key on public.sales_checklists (quote_id) where quote_id is not null;
create index if not exists sales_checklists_user_idx on public.sales_checklists (user_id, updated_at desc);

drop trigger if exists sales_checklists_updated_at on public.sales_checklists;
create trigger sales_checklists_updated_at before update on public.sales_checklists
  for each row execute function public.quotes_set_updated_at();

alter table public.sales_checklists enable row level security;
revoke all on public.sales_checklists from anon, authenticated;
grant select, insert, update, delete on public.sales_checklists to authenticated;

drop policy if exists "checklists_select_own" on public.sales_checklists;
create policy "checklists_select_own" on public.sales_checklists for select to authenticated using (user_id = auth.uid());
drop policy if exists "checklists_insert_own" on public.sales_checklists;
create policy "checklists_insert_own" on public.sales_checklists for insert to authenticated
  with check (user_id = auth.uid() and (quote_id is null or exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = auth.uid())));
drop policy if exists "checklists_update_own" on public.sales_checklists;
create policy "checklists_update_own" on public.sales_checklists for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "checklists_delete_own" on public.sales_checklists;
create policy "checklists_delete_own" on public.sales_checklists for delete to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';

commit;

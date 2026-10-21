-- HubSpot + quotes (sales calculator and the intranet's Quote Builder).
--   * quotes: the HubSpot contact / company / deal the quote is linked to, and the
--     last time it was sent (shown in My Quotes with an "Open in HubSpot" link).
--   * quote_sends: one row per "Send to customer" or "Save to HubSpot only": who,
--     when, to whom, subject + message, and how the email and HubSpot calls went.
--     Salespeople see and add rows for their own quotes; admins use the service role.
--   * hubspot_settings: one row of admin settings (default stage per pipeline,
--     email template, rep → HubSpot owner overrides). Service role only.
-- Numbered after the intranet's 0025 (the database is shared).

begin;

alter table public.quotes
  add column if not exists hubspot_contact_id text,
  add column if not exists hubspot_company_id text,
  add column if not exists hubspot_deal_id text,
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_sent_to text,
  add column if not exists last_send_action text check (last_send_action in ('send', 'save_only'));

create table if not exists public.quote_sends (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null check (action in ('send', 'save_only')),
  to_email text,
  cc text[] not null default '{}',
  subject text,
  message text,
  email_status text not null check (email_status in ('sent', 'failed', 'skipped', 'sample', 'not_sent')),
  hubspot_status text not null check (hubspot_status in ('done', 'partial', 'failed', 'sample')),
  hubspot_contact_id text,
  hubspot_company_id text,
  hubspot_deal_id text,
  hubspot_file_id text,
  hubspot_engagement_id text,
  hubspot_task_id text,
  quote_total numeric(14, 2),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists quote_sends_quote_idx on public.quote_sends (quote_id, created_at desc);

alter table public.quote_sends enable row level security;
revoke all on public.quote_sends from anon, authenticated;
grant select, insert on public.quote_sends to authenticated;

drop policy if exists "quote_sends_select_own" on public.quote_sends;
create policy "quote_sends_select_own" on public.quote_sends
  for select to authenticated
  using (exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = (select auth.uid())));

drop policy if exists "quote_sends_insert_own" on public.quote_sends;
create policy "quote_sends_insert_own" on public.quote_sends
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = (select auth.uid()))
  );
-- No update / delete: the history is append-only.

create table if not exists public.hubspot_settings (
  id smallint primary key default 1 check (id = 1),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.hubspot_settings enable row level security;
revoke all on public.hubspot_settings from anon, authenticated;
-- No policies: only the server (service role) reads and writes it, for calculator admins.
insert into public.hubspot_settings (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;

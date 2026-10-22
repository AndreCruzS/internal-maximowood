-- Vendor Master List, phase A (Paulo Renelli's "Lista master de fornecedores", 2025-04-24;
-- decisions confirmed 2026-10-22):
--   * Nobody gets paid unless the vendor is on the approved Master List. Adding or changing a
--     vendor needs approvals from "vendor approvers" (C-levels, Sabrina, Alexandra); how many is
--     the 'vendors' setting (required_approvals, default 1). Approval itself is phase B.
--   * Due diligence is an automatic sanctions check: every vendor (legal name, DBA) is screened
--     against the US Treasury OFAC SDN list, refreshed and re-screened nightly.
--     'match' blocks approval until approvers mark it a false positive with a note;
--     'possible_match' is a warning approvers must acknowledge (enforced in phase B).
--   * The BANK stays the source of truth for bank details: no full account or routing numbers
--     are stored here, only the bank, holder, country, currency, method and the last 4 digits.
--     Bank proof (voided check / bank letter), W-9 / W-8BEN etc. go to the private "vendors" bucket.
--   * Approved vendors are reviewed every 12 months (next_review_on).
--   * Payments (Magdiel, Vinicios, Silmara, Paulo) register vendors at the bank. Paulo may hold both
--     duties, but never two roles on the same request (enforced in phase B on vendor_requests).
--   * Nobody writes vendors / bank accounts directly, not even admins: only server code (import,
--     service role) and the phase-B approval functions. Everyone signed in reads the public Master List
--     (vendors_public: no tax id, contact or bank data).

begin;

-- ── Duties ──────────────────────────────────────────────────────────────────
alter table public.duty_holders drop constraint if exists duty_holders_duty_check;
alter table public.duty_holders add constraint duty_holders_duty_check
  check (duty in ('procurement', 'recruiting', 'vendor_approver', 'payments'));

create or replace function public.is_vendor_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.has_duty('vendor_approver'), false)
$$;
create or replace function public.is_payments() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.has_duty('payments'), false)
$$;
-- Who sees vendor details (tax id, contact, masked bank data, screenings, files).
create or replace function public.is_vendor_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.is_finance() or public.has_duty('vendor_approver') or public.has_duty('payments'), false)
$$;

-- ── Vendors ─────────────────────────────────────────────────────────────────
create table if not exists public.vendors (
  id                 uuid primary key default gen_random_uuid(),
  company_ids        text[] not null default '{}',          -- GMX companies allowed to pay this vendor
  legal_name         text not null check (length(btrim(legal_name)) between 1 and 200),
  dba                text not null default '' check (length(dba) <= 200),
  country            text not null default '' check (length(country) <= 60),
  tax_id             text not null default '' check (length(tax_id) <= 40),
  tax_id_type        text not null default '' check (tax_id_type in ('', 'ein', 'ssn_last4', 'itin', 'cnpj', 'cpf', 'vat', 'other')),
  category           text not null default '' check (length(category) <= 80),
  address            jsonb not null default '{}'::jsonb,
  contact            jsonb not null default '{}'::jsonb,       -- { name, email, phone }
  website            text not null default '' check (length(website) <= 300),
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_terms      text not null default '' check (length(payment_terms) <= 120),
  status             text not null default 'pending'
                     check (status in ('pending', 'approved', 'suspended', 'rejected', 'legacy_pending')),
  approved_at        timestamptz,
  next_review_on     date,
  source             text not null default 'request' check (source in ('request', 'import')),
  -- Idempotency for imports: normalized tax id, else normalized name + country.
  import_key         text unique,
  sanctions_status   text not null default 'not_run'
                     check (sanctions_status in ('not_run', 'clear', 'possible_match', 'match', 'false_positive')),
  sanctions_score    numeric(4, 3),
  sanctions_checked_at timestamptz,
  sanctions_cleared_by uuid references public.people (id) on delete set null,
  sanctions_cleared_note text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists vendors_status_idx on public.vendors (status);
create index if not exists vendors_name_idx on public.vendors (lower(legal_name));
drop trigger if exists vendors_updated_at on public.vendors;
create trigger vendors_updated_at before update on public.vendors for each row execute function public.set_updated_at();

-- What everyone signed in may see (the Master List), without tax id, contact or bank data.
create or replace view public.vendors_public as
  select id, legal_name, dba, country, company_ids, category, status, approved_at, next_review_on,
         sanctions_status, created_at
    from public.vendors;

-- ── Bank accounts (never full numbers) ──────────────────────────────────────
create table if not exists public.vendor_bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  vendor_id           uuid not null references public.vendors (id) on delete cascade,
  bank_name           text not null default '' check (length(bank_name) <= 120),
  bank_address        text not null default '' check (length(bank_address) <= 300),
  holder_name         text not null default '' check (length(holder_name) <= 200),
  account_last4       text not null default '' check (account_last4 ~ '^[0-9A-Za-z]{0,4}$'),
  routing_last4       text not null default '' check (routing_last4 ~ '^[0-9A-Za-z]{0,4}$'),
  swift_bic           text not null default '' check (swift_bic = '' or swift_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  bank_country        text not null default '' check (length(bank_country) <= 60),
  currency            text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_method      text not null default '' check (payment_method in ('', 'ach', 'wire', 'check', 'pix', 'other')),
  -- True once an approved request activates it (phase B); imported accounts start inactive.
  active              boolean not null default false,
  verified_by         uuid references public.people (id) on delete set null,
  verified_at         timestamptz,
  verification_method text not null default '' check (length(verification_method) <= 60),
  created_at          timestamptz not null default now()
);
create index if not exists vendor_bank_accounts_vendor_idx on public.vendor_bank_accounts (vendor_id);

-- ── Requests (new vendor or change) — used from phase B ─────────────────────
create table if not exists public.vendor_requests (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('new', 'change_bank', 'change_details', 'reactivate', 'legacy_review')),
  vendor_id            uuid references public.vendors (id) on delete set null,
  payload              jsonb not null default '{}'::jsonb,   -- proposed data (never full bank numbers)
  requester_person_id  uuid references public.people (id) on delete set null default public.my_person_id(),
  created_by           uuid references auth.users (id) on delete set null default auth.uid(),
  department_id        text references public.departments (id) on delete set null,
  company_ids          text[] not null default '{}',
  purpose              text not null default '' check (length(purpose) <= 2000),
  status               text not null default 'draft'
                       check (status in ('draft', 'submitted', 'dept_confirmed', 'pending_approval', 'needs_info',
                                         'approved', 'rejected', 'cancelled')),
  dept_confirmed_by    uuid references public.people (id) on delete set null,
  dept_confirmed_at    timestamptz,
  screening_status     text not null default 'not_run'
                       check (screening_status in ('not_run', 'clear', 'possible_match', 'match', 'false_positive')),
  registered_by        uuid references public.people (id) on delete set null,   -- Payments: set up at the bank
  registered_at        timestamptz,
  review_notes         text not null default '' check (length(review_notes) <= 4000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists vendor_requests_status_idx on public.vendor_requests (status, created_at desc);
drop trigger if exists vendor_requests_updated_at on public.vendor_requests;
create trigger vendor_requests_updated_at before update on public.vendor_requests for each row execute function public.set_updated_at();

create table if not exists public.vendor_request_approvals (
  request_id           uuid not null references public.vendor_requests (id) on delete cascade,
  approver_person_id   uuid not null references public.people (id) on delete cascade,
  decision             text not null check (decision in ('approve', 'reject')),
  comment              text not null default '' check (length(comment) <= 2000),
  screening_acknowledged boolean not null default false,
  at                   timestamptz not null default now(),
  primary key (request_id, approver_person_id)
);

-- Append-only audit of status changes.
create table if not exists public.vendor_request_events (
  id          bigserial primary key,
  request_id  uuid not null references public.vendor_requests (id) on delete cascade,
  from_status text,
  to_status   text not null,
  by_user     uuid default auth.uid(),
  by_person   uuid,
  at          timestamptz not null default now()
);
create index if not exists vendor_request_events_request_idx on public.vendor_request_events (request_id, at);

create or replace function public.vendor_request_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.vendor_request_events (request_id, from_status, to_status, by_user, by_person)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(), public.my_person_id());
  end if;
  return new;
end;
$$;
drop trigger if exists vendor_request_log on public.vendor_requests;
create trigger vendor_request_log after insert or update on public.vendor_requests
  for each row execute function public.vendor_request_log();

create table if not exists public.vendor_files (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid references public.vendor_requests (id) on delete cascade,
  vendor_id   uuid references public.vendors (id) on delete cascade,
  kind        text not null check (kind in ('bank_proof', 'tax_form', 'registry', 'contract', 'quote', 'certification', 'other')),
  path        text not null unique,
  file_name   text not null default '' check (length(file_name) <= 200),
  mime_type   text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes  int not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (request_id is not null or vendor_id is not null)
);

-- ── Sanctions (OFAC SDN) ────────────────────────────────────────────────────
create table if not exists public.sanctions_entries (
  id           text primary key,                -- 'sdn:<ent_num>' or 'alt:<alt_num>'
  ent_num      int not null,
  name         text not null,
  name_type    text not null default 'primary' check (name_type in ('primary', 'aka', 'fka', 'nka')),
  sdn_type     text not null default '',        -- '' (entity), individual, vessel, aircraft
  programs     text not null default '',
  norm         text not null,                   -- normalized name used for matching
  list_version text not null,
  updated_at   timestamptz not null default now()
);
create index if not exists sanctions_entries_ent_idx on public.sanctions_entries (ent_num);
create index if not exists sanctions_entries_version_idx on public.sanctions_entries (list_version);

create table if not exists public.vendor_screenings (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid references public.vendors (id) on delete cascade,
  request_id    uuid references public.vendor_requests (id) on delete cascade,
  screened_name text not null,
  result        text not null check (result in ('clear', 'possible_match', 'match')),
  score         numeric(4, 3) not null default 0,
  matches       jsonb not null default '[]'::jsonb,   -- [{ent_num, name, name_type, sdn_type, programs, score}]
  list_version  text not null default '',
  trigger       text not null default 'manual' check (trigger in ('import', 'request', 'nightly', 'manual')),
  screened_at   timestamptz not null default now()
);
create index if not exists vendor_screenings_vendor_idx on public.vendor_screenings (vendor_id, screened_at desc);

-- ── Settings ────────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('vendors', '{"required_approvals": 1, "review_months": 12}'::jsonb),
  ('sanctions', '{"version": null, "entries": 0, "refreshed_at": null}'::jsonb)
on conflict (key) do nothing;

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.vendors                  enable row level security;
alter table public.vendor_bank_accounts     enable row level security;
alter table public.vendor_requests          enable row level security;
alter table public.vendor_request_approvals enable row level security;
alter table public.vendor_request_events    enable row level security;
alter table public.vendor_files             enable row level security;
alter table public.sanctions_entries        enable row level security;
alter table public.vendor_screenings        enable row level security;

revoke all on public.vendors, public.vendor_bank_accounts, public.vendor_requests, public.vendor_request_approvals,
  public.vendor_request_events, public.vendor_files, public.sanctions_entries, public.vendor_screenings,
  public.vendors_public from anon;
-- Read-only for the app; writes go through the service role (import) and phase-B functions.
grant select on public.vendors, public.vendor_bank_accounts, public.vendor_request_approvals,
  public.vendor_request_events, public.sanctions_entries, public.vendor_screenings to authenticated;
grant select on public.vendors_public to authenticated;
grant select, insert, update on public.vendor_requests to authenticated;
grant select, insert, delete on public.vendor_files to authenticated;

create policy "vendor staff read vendors" on public.vendors for select to authenticated using (public.is_vendor_staff());
create policy "vendor staff read bank accounts" on public.vendor_bank_accounts for select to authenticated using (public.is_vendor_staff());
create policy "vendor staff read screenings" on public.vendor_screenings for select to authenticated using (public.is_vendor_staff());
create policy "vendor staff read sanctions list" on public.sanctions_entries for select to authenticated using (public.is_vendor_staff());

create policy "read vendor requests" on public.vendor_requests for select to authenticated using (
  requester_person_id = public.my_person_id() or public.is_vendor_staff()
  or (department_id is not null and public.can_manage(department_id))
);
create policy "draft vendor requests" on public.vendor_requests for insert to authenticated with check (
  created_by = auth.uid() and requester_person_id = public.my_person_id()
  and status in ('draft', 'submitted') and dept_confirmed_by is null and registered_by is null
  and screening_status = 'not_run'
);
-- Phase A: the requester may only edit a draft or cancel; every other move is a phase-B function.
create policy "edit own draft vendor requests" on public.vendor_requests for update to authenticated
  using (requester_person_id = public.my_person_id() and status in ('draft', 'submitted', 'needs_info'))
  with check (requester_person_id = public.my_person_id() and status in ('draft', 'submitted', 'needs_info', 'cancelled')
              and dept_confirmed_by is null and registered_by is null);

create policy "read vendor approvals" on public.vendor_request_approvals for select to authenticated using (
  public.is_vendor_staff()
  or exists (select 1 from public.vendor_requests r where r.id = request_id and r.requester_person_id = public.my_person_id())
);
create policy "read vendor request events" on public.vendor_request_events for select to authenticated using (
  public.is_vendor_staff()
  or exists (select 1 from public.vendor_requests r where r.id = request_id and r.requester_person_id = public.my_person_id())
);

create policy "read vendor files" on public.vendor_files for select to authenticated
  using (uploaded_by = auth.uid() or public.is_vendor_staff());
create policy "upload vendor files" on public.vendor_files for insert to authenticated
  with check (uploaded_by = auth.uid() and split_part(path, '/', 1) = auth.uid()::text);
create policy "remove own vendor files" on public.vendor_files for delete to authenticated
  using (uploaded_by = auth.uid() and request_id is not null
         and exists (select 1 from public.vendor_requests r where r.id = request_id and r.status = 'draft'));

-- ── Files bucket ────────────────────────────────────────────────────────────
-- Private; each uploader writes into their own folder (<auth uid>/<file>). Vendor staff read all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendors', 'vendors', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "upload vendor documents" on storage.objects;
create policy "upload vendor documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendors' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read vendor documents" on storage.objects;
create policy "read vendor documents" on storage.objects for select to authenticated
  using (bucket_id = 'vendors' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_vendor_staff()));
drop policy if exists "delete own vendor documents" on storage.objects;
create policy "delete own vendor documents" on storage.objects for delete to authenticated
  using (bucket_id = 'vendors' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Seed duties (only people who exist; admins manage them afterwards) ──────
-- Vendor approvers: every C-level (by position title), the named C-levels, Sabrina and Alexandra.
insert into public.duty_holders (duty, person_id)
select distinct 'vendor_approver', p.id
  from public.people p
 where p.active
   and (
     exists (select 1 from public.positions pos
              where pos.person_id = p.id
                and pos.title ~* '(^|[^a-z])(ceo|coo|cfo|cco|cto|cmo|cio|president|presidente|chief)([^a-z]|$)')
     or p.full_name ~* '^(giovani miguel|jo[aã]o augusto fugiwara|guto fugiwara|jo[aã]o costa|diogo saling|paulo renelli)$'
     or p.full_name ~* '^(sabrina|alexandra)( |$)'
   )
   and not exists (select 1 from public.duty_holders h where h.duty = 'vendor_approver' and h.person_id = p.id);

-- Payments: Magdiel, Vinicios / Vinicius, Silmara, and Paulo (covers the gaps for now).
insert into public.duty_holders (duty, person_id)
select distinct 'payments', p.id
  from public.people p
 where p.active
   and p.full_name ~* '^(magdiel|vin[ií]ci[ou]s|silmara)( |$)|^paulo renelli$'
   and not exists (select 1 from public.duty_holders h where h.duty = 'payments' and h.person_id = p.id);

notify pgrst, 'reload schema';

commit;

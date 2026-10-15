-- Expenses, connected to Ramp.
--  * Receipts are uploaded in the intranet and pushed to Ramp by the server
--    (queued until the Ramp API is connected). A receipt can be for your own
--    card, for someone else's card you used, or an out-of-pocket reimbursement.
--  * A card owner asks whoever used the card for the receipt (receipt_requests);
--    it lands on that person's Expenses page and goes back on the owner's card.
--  * Fund requests go into Ramp's approval flow once connected.
--  * people.ramp_user_id links a person to their Ramp user (matched by email).
--  * Finance (and admins) see everything and handle the queue.

begin;

create or replace function public.is_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.in_department('finance'), false)
$$;

alter table public.people add column if not exists ramp_user_id text unique;

-- ── Receipts ────────────────────────────────────────────────────────────────
create table public.expense_receipts (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('card', 'reimbursement')),
  -- The card holder (card) or the person being paid back (reimbursement).
  owner_person_id    uuid not null references public.people (id) on delete cascade,
  -- Who made the purchase and uploaded the receipt; can differ from the owner.
  uploader_person_id uuid references public.people (id) on delete set null default public.my_person_id(),
  uploaded_by        uuid references auth.users (id) on delete set null default auth.uid(),
  transaction_id     text check (transaction_id is null or length(transaction_id) <= 100),
  merchant           text not null default '' check (length(merchant) <= 200),
  amount             numeric(12, 2) check (amount is null or amount >= 0),
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  spent_on           date,
  memo               text not null default '' check (length(memo) <= 1000),
  file_path          text not null check (length(file_path) <= 300),
  file_name          text not null default '' check (length(file_name) <= 200),
  -- queued: waiting for Ramp; sent: in Ramp; failed: Ramp refused it (see error);
  -- demo: uploaded against sample data, never sent.
  status             text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'demo')),
  ramp_id            text,
  error              text,
  attempts           int not null default 0,
  idempotency_key    uuid not null default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  sent_at            timestamptz,
  -- Reimbursements are only for yourself; card receipts can be for any card you used.
  check (kind = 'card' or owner_person_id = uploader_person_id)
);
create index expense_receipts_owner_idx on public.expense_receipts (owner_person_id, created_at desc);
create index expense_receipts_uploader_idx on public.expense_receipts (uploaded_by, created_at desc);
create index expense_receipts_queue_idx on public.expense_receipts (status) where status in ('queued', 'failed');

alter table public.expense_receipts enable row level security;
grant select, insert, delete on public.expense_receipts to authenticated;
create policy "see receipts" on public.expense_receipts for select to authenticated
  using (uploaded_by = auth.uid() or owner_person_id = public.my_person_id() or public.is_finance());
create policy "upload receipts" on public.expense_receipts for insert to authenticated
  with check (uploaded_by = auth.uid() and uploader_person_id = public.my_person_id()
              and status in ('queued', 'demo') and ramp_id is null and attempts = 0);
-- Taking back a receipt that hasn't reached Ramp.
create policy "remove receipts" on public.expense_receipts for delete to authenticated
  using ((uploaded_by = auth.uid() and status <> 'sent') or public.is_finance());
-- status / ramp_id / error are written by the server (service role) only.

-- ── Asking for a receipt (shared cards) ─────────────────────────────────────
create table public.receipt_requests (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  text check (transaction_id is null or length(transaction_id) <= 100),
  is_demo         boolean not null default false,
  owner_person_id uuid not null references public.people (id) on delete cascade default public.my_person_id(),
  asked_person_id uuid not null references public.people (id) on delete cascade,
  merchant        text not null default '' check (length(merchant) <= 200),
  amount          numeric(12, 2),
  currency        text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  spent_on        date,
  note            text not null default '' check (length(note) <= 500),
  status          text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  receipt_id      uuid references public.expense_receipts (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  done_at         timestamptz,
  check (asked_person_id <> owner_person_id)
);
create unique index receipt_requests_open_txn_idx on public.receipt_requests (transaction_id) where status = 'open' and transaction_id is not null;
create index receipt_requests_asked_idx on public.receipt_requests (asked_person_id, status);

alter table public.receipt_requests enable row level security;
grant select, insert, update on public.receipt_requests to authenticated;
create policy "see receipt requests" on public.receipt_requests for select to authenticated
  using (owner_person_id = public.my_person_id() or asked_person_id = public.my_person_id() or public.is_finance());
create policy "ask for a receipt" on public.receipt_requests for insert to authenticated
  with check (created_by = auth.uid() and status = 'open' and receipt_id is null
              and (owner_person_id = public.my_person_id() or public.is_finance()));
-- The owner (or Finance) cancels; answering goes through answer_receipt_request.
create policy "cancel receipt requests" on public.receipt_requests for update to authenticated
  using (owner_person_id = public.my_person_id() or public.is_finance())
  with check (status in ('open', 'cancelled') and receipt_id is null);

-- The person asked (or the owner) answers with a receipt they uploaded for that card.
create or replace function public.answer_receipt_request(request uuid, receipt uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  q public.receipt_requests;
  r public.expense_receipts;
begin
  select * into q from public.receipt_requests where id = request and status = 'open';
  if q.id is null then raise exception 'This request is not open'; end if;
  if not coalesce(public.my_person_id() in (q.asked_person_id, q.owner_person_id), false) then
    raise exception 'Only the person asked or the card owner can answer';
  end if;
  select * into r from public.expense_receipts where id = receipt and uploaded_by = auth.uid();
  if r.id is null or r.kind <> 'card' or r.owner_person_id <> q.owner_person_id then
    raise exception 'That receipt is not for this card';
  end if;
  update public.receipt_requests set status = 'done', receipt_id = r.id, done_at = now() where id = q.id;
end;
$$;
revoke execute on function public.answer_receipt_request(uuid, uuid) from anon;

-- ── Fund requests ───────────────────────────────────────────────────────────
create table public.fund_requests (
  id                  uuid primary key default gen_random_uuid(),
  requester_person_id uuid not null references public.people (id) on delete cascade default public.my_person_id(),
  created_by          uuid references auth.users (id) on delete set null default auth.uid(),
  amount              numeric(12, 2) not null check (amount > 0),
  currency            text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  purpose             text not null check (length(btrim(purpose)) between 1 and 200),
  details             text not null default '' check (length(details) <= 2000),
  vendor              text not null default '' check (length(vendor) <= 200),
  needed_by           date,
  frequency           text not null default 'one_time' check (frequency in ('one_time', 'monthly', 'yearly')),
  department_id       text references public.departments (id) on delete set null,
  -- submitted: waiting to reach Ramp; sent: in Ramp's approval flow; approved / rejected:
  -- the outcome (from Ramp or Finance); cancelled by the requester; demo: sample data only.
  status              text not null default 'submitted' check (status in ('submitted', 'sent', 'approved', 'rejected', 'cancelled', 'demo')),
  ramp_id             text,
  error               text,
  decided_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index fund_requests_requester_idx on public.fund_requests (requester_person_id, created_at desc);

alter table public.fund_requests enable row level security;
grant select, insert, update on public.fund_requests to authenticated;
create policy "see fund requests" on public.fund_requests for select to authenticated
  using (requester_person_id = public.my_person_id() or public.is_finance());
create policy "request funds" on public.fund_requests for insert to authenticated
  with check (created_by = auth.uid() and requester_person_id = public.my_person_id()
              and status in ('submitted', 'demo') and ramp_id is null);
create policy "cancel or decide fund requests" on public.fund_requests for update to authenticated
  using ((requester_person_id = public.my_person_id() and status in ('submitted', 'demo')) or public.is_finance())
  with check (public.is_finance() or status = 'cancelled');

-- ── Ramp webhook events (server only) ───────────────────────────────────────
create table public.ramp_events (
  id           text primary key,
  type         text not null,
  object_id    text,
  payload      jsonb not null default '{}'::jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.ramp_events enable row level security;
-- No grants: written and read by the server (service role) only.

-- ── Receipt files ───────────────────────────────────────────────────────────
-- Private bucket; each person uploads into their own folder (<auth uid>/<file>).
-- The card owner and Finance can open receipts filed for that card.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "upload own receipts" on storage.objects;
create policy "upload own receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read receipts" on storage.objects;
create policy "read receipts" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_finance()
    or exists (select 1 from public.expense_receipts r where r.file_path = name and r.owner_person_id = public.my_person_id())
  ));
drop policy if exists "delete own receipts" on storage.objects;
create policy "delete own receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_finance()));

commit;

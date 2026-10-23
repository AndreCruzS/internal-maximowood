-- Vendor Master List, phase C: changes to approved vendors, suspension, and the 12-month review.
--
--   * Change requests (anyone signed in, from the vendor's page), same flow as a new vendor:
--     department head → automatic OFAC check → approvals → Payments.
--       - change_bank: new bank details (last 4 only) + a NEW bank proof. Approval adds the new
--         account INACTIVE; the old one stays active until Payments registers the new one, then both
--         flip in one transaction (register_vendor).
--       - change_details: only the fields listed in payload.changed are applied (legal name, DBA,
--         country, tax id, address, contact, website, category, companies). The values before the
--         change are kept on the request (previous) and in vendor_events.
--   * Suspend: a vendor approver suspends a vendor immediately, with a reason (vendor_events).
--     Reactivation is a 'reactivate' request that needs approval like any other.
--   * Yearly review: 'periodic_review' requests (started by Finance / approvers, from 30 days before
--     next_review_on) renew next_review_on when approved; no bank step. The public list shows
--     review_due = 'due_soon' / 'overdue' (computed, so it's never stale); a nightly job emails a digest.
--   * vendor_events: append-only history of each vendor (created, bank changes, suspensions, reviews…).
--   * Paulo's rule still holds on every request: whoever requested, confirmed, cleared a sanctions hit
--     or approved can't register it at the bank.

begin;

-- ── Columns & kinds ─────────────────────────────────────────────────────────
alter table public.vendor_requests drop constraint if exists vendor_requests_kind_check;
alter table public.vendor_requests add constraint vendor_requests_kind_check
  check (kind in ('new', 'change_bank', 'change_details', 'reactivate', 'legacy_review', 'periodic_review'));

-- The vendor as it was before the change (snapshot on submit, refreshed when applied). Vendor staff
-- read it through vendor_request_previous(); requesters never see it (it holds tax id / contact).
alter table public.vendor_requests add column if not exists previous jsonb not null default '{}'::jsonb;

alter table public.vendors
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists suspended_at     timestamptz,
  add column if not exists suspended_reason text not null default '' check (length(suspended_reason) <= 2000);

-- The Master List shows when a review is due (computed: never stale).
create or replace view public.vendors_public as
  select id, legal_name, dba, country, company_ids, category, status, approved_at, next_review_on,
         sanctions_status, created_at,
         case
           when status = 'approved' and next_review_on is not null and next_review_on < current_date then 'overdue'
           when status = 'approved' and next_review_on is not null and next_review_on <= current_date + 30 then 'due_soon'
         end as review_due
    from public.vendors;
grant select on public.vendors_public to authenticated;

-- ── Vendor history (append-only) ────────────────────────────────────────────
create table if not exists public.vendor_events (
  id          bigserial primary key,
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  request_id  uuid references public.vendor_requests (id) on delete set null,
  kind        text not null check (kind in ('created', 'details_changed', 'bank_added', 'bank_activated', 'bank_deactivated',
                                            'suspended', 'reactivated', 'reviewed', 'sanctions_cleared')),
  note        text not null default '' check (length(note) <= 2000),
  details     jsonb not null default '{}'::jsonb,
  by_user     uuid default auth.uid(),
  by_person   uuid default public.my_person_id(),
  at          timestamptz not null default now()
);
create index if not exists vendor_events_vendor_idx on public.vendor_events (vendor_id, at);
alter table public.vendor_events enable row level security;
revoke all on public.vendor_events from anon;
grant select on public.vendor_events to authenticated;
create policy "vendor staff read vendor events" on public.vendor_events for select to authenticated using (public.is_vendor_staff());

create or replace function public.vendor_event(vid uuid, req uuid, k text, note text default '', details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.vendor_events (vendor_id, request_id, kind, note, details)
  values (vid, req, k, left(coalesce(note, ''), 2000), coalesce(details, '{}'::jsonb))
$$;
revoke execute on function public.vendor_event(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Kinds whose approval needs Payments to act at the bank afterwards (a yearly review doesn't).
create or replace function public.vendor_kind_needs_bank(k text) returns boolean
language sql immutable as $$
  select k in ('new', 'change_bank', 'change_details', 'legacy_review', 'reactivate')
$$;

-- The fields a details change may touch.
create or replace function public.vendor_change_fields() returns text[]
language sql immutable as $$
  select array['legal_name', 'dba', 'country', 'tax_id', 'address', 'contact', 'website', 'category', 'companies']
$$;

-- What the vendor looks like now (for the "before" side of a change). Never full bank numbers:
-- the bank accounts table doesn't have them.
create or replace function public.vendor_snapshot(vid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'legal_name', v.legal_name, 'dba', v.dba, 'country', v.country, 'tax_id', v.tax_id, 'tax_id_type', v.tax_id_type,
    'address', v.address, 'contact', v.contact, 'website', v.website, 'category', v.category,
    'companies', to_jsonb(v.company_ids), 'status', v.status,
    'bank', (select jsonb_agg(jsonb_build_object('id', b.id, 'bank_name', b.bank_name, 'holder_name', b.holder_name,
                                                 'account_last4', b.account_last4, 'routing_last4', b.routing_last4,
                                                 'swift_bic', b.swift_bic, 'bank_country', b.bank_country, 'currency', b.currency,
                                                 'payment_method', b.payment_method) order by b.created_at)
               from public.vendor_bank_accounts b where b.vendor_id = v.id and b.active))
    from public.vendors v where v.id = vid
$$;
revoke execute on function public.vendor_snapshot(uuid) from public, anon, authenticated;

-- The "before" snapshot of a request, for vendor staff only.
create or replace function public.vendor_request_previous(target uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_vendor_staff() then
    (select case when r.previous = '{}'::jsonb and r.vendor_id is not null and r.status not in ('approved', 'rejected', 'cancelled')
                 then public.vendor_snapshot(r.vendor_id) else r.previous end
       from public.vendor_requests r where r.id = target)
  end
$$;
revoke execute on function public.vendor_request_previous(uuid) from anon;

-- Does a details change actually change anything?
create or replace function public.vendor_details_change_count(target uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  r public.vendor_requests;
  v public.vendors;
  p jsonb; d jsonb; ch jsonb;
  n int := 0;
begin
  select * into r from public.vendor_requests where id = target;
  select * into v from public.vendors where id = r.vendor_id;
  if not found then return 0; end if;
  p := coalesce(r.payload -> 'vendor', '{}'::jsonb);
  d := coalesce(r.payload -> 'details', '{}'::jsonb);
  ch := coalesce(r.payload -> 'changed', '[]'::jsonb);
  if ch ? 'legal_name' and btrim(coalesce(p ->> 'legal_name', '')) is distinct from v.legal_name then n := n + 1; end if;
  if ch ? 'dba' and coalesce(p ->> 'dba', '') is distinct from v.dba then n := n + 1; end if;
  if ch ? 'country' and coalesce(p ->> 'country', '') is distinct from v.country then n := n + 1; end if;
  if ch ? 'tax_id' and (coalesce(p ->> 'tax_id', '') is distinct from v.tax_id or coalesce(p ->> 'tax_id_type', '') is distinct from v.tax_id_type) then n := n + 1; end if;
  if ch ? 'address' and coalesce(p -> 'address', '{}'::jsonb) is distinct from v.address then n := n + 1; end if;
  if ch ? 'contact' and coalesce(p -> 'contact', '{}'::jsonb) is distinct from v.contact then n := n + 1; end if;
  if ch ? 'website' and coalesce(p ->> 'website', '') is distinct from v.website then n := n + 1; end if;
  if ch ? 'category' and coalesce(d ->> 'category', '') is distinct from v.category then n := n + 1; end if;
  if ch ? 'companies' and coalesce(array_length(r.company_ids, 1), 0) > 0
     and (select array_agg(x order by x) from unnest(r.company_ids) x) is distinct from (select array_agg(x order by x) from unnest(v.company_ids) x) then n := n + 1; end if;
  return n;
end;
$$;
revoke execute on function public.vendor_details_change_count(uuid) from public, anon, authenticated;

-- ── Guard: clients may now start change requests too ────────────────────────
-- The guard runs as the caller, who can't read vendors (RLS): look the status up as definer.
create or replace function public.vendor_status_of(vid uuid) returns text
language sql stable security definer set search_path = public as $$
  select status from public.vendors where id = vid
$$;
revoke execute on function public.vendor_status_of(uuid) from anon;

create or replace function public.vendor_requests_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  vstatus text;
begin
  if auth.uid() is null or current_setting('app.vendor_fn', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A vendor request starts as a draft.'; end if;
    if new.kind = 'new' then
      new.vendor_id := null;
    elsif new.kind in ('change_bank', 'change_details') then
      vstatus := public.vendor_status_of(new.vendor_id);
      if vstatus is null then raise exception 'Vendor not found.'; end if;
      if vstatus not in ('approved', 'suspended') then raise exception 'Only vendors on the approved list can be changed. Review it first.'; end if;
    else
      raise exception 'Reviews and reactivations are started from the vendor''s page.';
    end if;
    new.dept_confirmed_by := null; new.dept_confirmed_at := null; new.dept_note := '';
    new.registered_by := null; new.registered_at := null; new.registration_method := '';
    new.screening_status := 'not_run'; new.screening_score := null; new.screening_checked_at := null;
    new.sanctions_cleared_by := null; new.sanctions_note := ''; new.review_notes := '';
    new.decision_note := ''; new.submitted_at := null; new.decided_at := null; new.previous := '{}'::jsonb;
    return new;
  end if;

  if old.status in ('draft', 'needs_info') and new.status = old.status then
    null; -- editing a draft: payload, department, companies and purpose may change
  elsif new.status = 'cancelled' and old.status in ('draft', 'submitted', 'needs_info', 'pending_approval') then
    new.payload := old.payload; new.department_id := old.department_id;
    new.company_ids := old.company_ids; new.purpose := old.purpose;
  else
    raise exception 'Use the request''s buttons to move it forward.';
  end if;
  new.kind := old.kind; new.vendor_id := old.vendor_id;
  new.requester_person_id := old.requester_person_id; new.created_by := old.created_by;
  new.dept_confirmed_by := old.dept_confirmed_by; new.dept_confirmed_at := old.dept_confirmed_at; new.dept_note := old.dept_note;
  new.registered_by := old.registered_by; new.registered_at := old.registered_at; new.registration_method := old.registration_method;
  new.screening_status := old.screening_status; new.screening_score := old.screening_score; new.screening_checked_at := old.screening_checked_at;
  new.sanctions_cleared_by := old.sanctions_cleared_by; new.sanctions_note := old.sanctions_note; new.review_notes := old.review_notes;
  new.decision_note := old.decision_note; new.submitted_at := old.submitted_at; new.decided_at := old.decided_at;
  new.previous := old.previous;
  return new;
end;
$$;

drop policy if exists "draft vendor requests" on public.vendor_requests;
create policy "draft vendor requests" on public.vendor_requests for insert to authenticated with check (
  created_by = auth.uid() and requester_person_id = public.my_person_id() and status = 'draft'
  and kind in ('new', 'change_bank', 'change_details')
);

-- ── Submit (now knows about change requests) ────────────────────────────────
create or replace function public.submit_vendor_request(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  me uuid := public.my_person_id();
  next_status text;
  b jsonb;
begin
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  if me is null or r.requester_person_id is distinct from me then
    raise exception 'Only the person who wrote the request can submit it.';
  end if;
  if r.status not in ('draft', 'needs_info') then raise exception 'This request was already submitted.'; end if;
  b := coalesce(r.payload -> 'bank', '{}'::jsonb);

  if r.kind = 'new' then
    perform public.vendor_payload_check(r.payload);
    if coalesce(array_length(r.company_ids, 1), 0) = 0 then raise exception 'Choose which company will pay this vendor.'; end if;
    if not exists (select 1 from public.vendor_files f where f.request_id = target and f.kind = 'bank_proof') then
      raise exception 'Attach the bank proof (voided check or bank letter).';
    end if;
  elsif r.kind in ('change_bank', 'change_details') then
    if not exists (select 1 from public.vendors v where v.id = r.vendor_id and v.status in ('approved', 'suspended')) then
      raise exception 'Only vendors on the approved list can be changed.';
    end if;
    if exists (select 1 from public.vendor_requests o
                where o.vendor_id = r.vendor_id and o.id <> target
                  and o.kind in ('change_bank', 'change_details', 'reactivate', 'periodic_review', 'legacy_review')
                  and (o.status in ('submitted', 'pending_approval')
                       or (o.status = 'approved' and o.registered_at is null and public.vendor_kind_needs_bank(o.kind)))) then
      raise exception 'There''s already an open request for this vendor. Wait for it to finish first.';
    end if;
    perform public.vendor_payload_check(r.payload);
    if r.kind = 'change_bank' then
      if btrim(coalesce(b ->> 'bank_name', '')) = '' or coalesce(b ->> 'account_last4', '') = '' then
        raise exception 'Add the new bank and account number.';
      end if;
      if not exists (select 1 from public.vendor_files f where f.request_id = target and f.kind = 'bank_proof') then
        raise exception 'Attach the bank proof for the NEW account (voided check or bank letter).';
      end if;
    else
      if public.vendor_details_change_count(target) = 0 then raise exception 'Nothing changes: edit at least one field.'; end if;
    end if;
    if length(btrim(coalesce(r.purpose, ''))) = 0 then raise exception 'Say why this change is needed.'; end if;
  end if;
  if r.department_id is null and not public.has_duty('vendor_approver') then
    raise exception 'Choose the department this vendor is for.';
  end if;

  next_status := case
    when r.dept_confirmed_by is not null or r.department_id is null
         or me in (select public.vendor_dept_heads(r.department_id)) then 'pending_approval'
    else 'submitted' end;

  perform set_config('app.vendor_fn', 'on', true);
  update public.vendor_requests
     set status = next_status,
         submitted_at = now(),
         decision_note = '',
         screening_status = 'not_run',
         screening_score = null, screening_checked_at = null,
         sanctions_cleared_by = null, sanctions_note = '',
         previous = case when r.vendor_id is not null then coalesce(public.vendor_snapshot(r.vendor_id), '{}'::jsonb) else '{}'::jsonb end,
         dept_confirmed_by = case when next_status = 'pending_approval' and dept_confirmed_by is null then me else dept_confirmed_by end,
         dept_confirmed_at = case when next_status = 'pending_approval' and dept_confirmed_at is null then now() else dept_confirmed_at end
   where id = target;
  delete from public.vendor_request_approvals where request_id = target;
  perform set_config('app.vendor_fn', 'off', true);
  return next_status;
end;
$$;

-- ── Applying an approved request (all kinds) ────────────────────────────────
create or replace function public.apply_vendor_request(target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  v jsonb; b jsonb; d jsonb; ch jsonb;
  months int := greatest(1, coalesce((select (value ->> 'review_months')::int from public.app_settings where key = 'vendors'), 12));
  vid uuid;
  sanctions text;
  before jsonb;
  new_bank uuid;
begin
  select * into r from public.vendor_requests where id = target for update;
  v := coalesce(r.payload -> 'vendor', '{}'::jsonb);
  b := coalesce(r.payload -> 'bank', '{}'::jsonb);
  d := coalesce(r.payload -> 'details', '{}'::jsonb);
  ch := coalesce(r.payload -> 'changed', '[]'::jsonb);
  sanctions := r.screening_status;

  if r.kind = 'new' then
    perform public.vendor_payload_check(r.payload);
    insert into public.vendors (company_ids, legal_name, dba, country, tax_id, tax_id_type, category, address, contact,
                                website, currency, payment_terms, status, approved_at, next_review_on, last_reviewed_at, source,
                                sanctions_status, sanctions_score, sanctions_checked_at, sanctions_cleared_by, sanctions_cleared_note)
    values (r.company_ids,
            btrim(v ->> 'legal_name'),
            left(coalesce(v ->> 'dba', ''), 200),
            left(coalesce(v ->> 'country', ''), 60),
            left(coalesce(v ->> 'tax_id', ''), 40),
            coalesce(v ->> 'tax_id_type', ''),
            left(coalesce(d ->> 'category', ''), 80),
            coalesce(v -> 'address', '{}'::jsonb),
            coalesce(v -> 'contact', '{}'::jsonb),
            left(coalesce(v ->> 'website', ''), 300),
            upper(coalesce(nullif(b ->> 'currency', ''), 'USD')),
            left(coalesce(d ->> 'payment_terms', ''), 120),
            'approved', now(), (now() + make_interval(months => months))::date, now(), 'request',
            sanctions, r.screening_score, r.screening_checked_at, r.sanctions_cleared_by, r.sanctions_note)
    returning id into vid;
    perform public.vendor_event(vid, target, 'created');
  else
    vid := r.vendor_id;
    if vid is null then raise exception 'This request has no vendor.'; end if;
    before := public.vendor_snapshot(vid);
  end if;

  if r.kind in ('legacy_review', 'reactivate', 'periodic_review') then
    update public.vendors
       set status = 'approved',
           approved_at = case when r.kind = 'periodic_review' then approved_at else now() end,
           next_review_on = (now() + make_interval(months => months))::date,
           last_reviewed_at = now(),
           suspended_at = case when r.kind = 'reactivate' then null else suspended_at end,
           suspended_reason = case when r.kind = 'reactivate' then '' else suspended_reason end,
           sanctions_status = case when sanctions = 'not_run' then sanctions_status else sanctions end,
           sanctions_score = coalesce(r.screening_score, sanctions_score),
           sanctions_checked_at = coalesce(r.screening_checked_at, sanctions_checked_at),
           sanctions_cleared_by = coalesce(r.sanctions_cleared_by, sanctions_cleared_by),
           sanctions_cleared_note = case when r.sanctions_note <> '' then r.sanctions_note else sanctions_cleared_note end
     where id = vid;
    perform public.vendor_event(vid, target, case when r.kind = 'reactivate' then 'reactivated' else 'reviewed' end, r.purpose);
  elsif r.kind = 'change_details' then
    update public.vendors
       set legal_name   = case when ch ? 'legal_name' and btrim(coalesce(v ->> 'legal_name', '')) <> '' then left(btrim(v ->> 'legal_name'), 200) else legal_name end,
           dba          = case when ch ? 'dba' then left(coalesce(v ->> 'dba', ''), 200) else dba end,
           country      = case when ch ? 'country' then left(coalesce(v ->> 'country', ''), 60) else country end,
           tax_id       = case when ch ? 'tax_id' then left(coalesce(v ->> 'tax_id', ''), 40) else tax_id end,
           tax_id_type  = case when ch ? 'tax_id' then coalesce(v ->> 'tax_id_type', '') else tax_id_type end,
           address      = case when ch ? 'address' then coalesce(v -> 'address', '{}'::jsonb) else address end,
           contact      = case when ch ? 'contact' then coalesce(v -> 'contact', '{}'::jsonb) else contact end,
           website      = case when ch ? 'website' then left(coalesce(v ->> 'website', ''), 300) else website end,
           category     = case when ch ? 'category' then left(coalesce(d ->> 'category', ''), 80) else category end,
           company_ids  = case when ch ? 'companies' and coalesce(array_length(r.company_ids, 1), 0) > 0 then r.company_ids else company_ids end,
           sanctions_status = case when sanctions = 'not_run' then sanctions_status else sanctions end,
           sanctions_score = coalesce(r.screening_score, sanctions_score),
           sanctions_checked_at = coalesce(r.screening_checked_at, sanctions_checked_at),
           sanctions_cleared_by = coalesce(r.sanctions_cleared_by, sanctions_cleared_by),
           sanctions_cleared_note = case when r.sanctions_note <> '' then r.sanctions_note else sanctions_cleared_note end
     where id = vid;
    perform public.vendor_event(vid, target, 'details_changed', r.purpose, jsonb_build_object('fields', ch, 'before', before));
  end if;

  if r.kind in ('new', 'change_bank')
     and (coalesce(b ->> 'bank_name', '') <> '' or coalesce(b ->> 'account_last4', '') <> '') then
    insert into public.vendor_bank_accounts (vendor_id, request_id, bank_name, bank_address, holder_name, account_last4,
                                             routing_last4, swift_bic, bank_country, currency, payment_method, active)
    values (vid, r.id,
            left(coalesce(b ->> 'bank_name', ''), 120),
            left(coalesce(b ->> 'bank_address', ''), 300),
            left(coalesce(b ->> 'holder_name', ''), 200),
            coalesce(b ->> 'account_last4', ''),
            coalesce(b ->> 'routing_last4', ''),
            upper(coalesce(b ->> 'swift_bic', '')),
            left(coalesce(b ->> 'bank_country', ''), 60),
            upper(coalesce(nullif(b ->> 'currency', ''), 'USD')),
            coalesce(b ->> 'payment_method', ''),
            false)
    returning id into new_bank;
    if r.kind = 'change_bank' then
      perform public.vendor_event(vid, target, 'bank_added', r.purpose,
        jsonb_build_object('bank_account_id', new_bank, 'bank_name', b ->> 'bank_name', 'account_last4', b ->> 'account_last4'));
    end if;
  end if;

  if r.sanctions_cleared_by is not null then
    perform public.vendor_event(vid, target, 'sanctions_cleared', r.sanctions_note);
  end if;

  update public.vendor_requests
     set vendor_id = vid,
         previous = case when before is not null then before else previous end
   where id = target;
  return vid;
end;
$$;
revoke execute on function public.apply_vendor_request(uuid) from public, anon, authenticated;

-- ── Registration at the bank (Payments) ─────────────────────────────────────
create or replace function public.register_vendor(target uuid, method text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  me uuid := public.my_person_id();
  m text := left(coalesce(btrim(method), ''), 60);
  old_ids uuid[];
begin
  if me is null or not public.has_duty('payments') then raise exception 'Only Payments can register vendors at the bank.'; end if;
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'approved' or r.registered_at is not null or not public.vendor_kind_needs_bank(r.kind) then
    raise exception 'This vendor isn''t waiting to be registered.';
  end if;
  if me = r.requester_person_id or me = r.dept_confirmed_by or me = r.sanctions_cleared_by
     or exists (select 1 from public.vendor_request_approvals a where a.request_id = target and a.approver_person_id = me) then
    raise exception 'You had another role on this request, so someone else from Payments has to register it.';
  end if;

  perform set_config('app.vendor_fn', 'on', true);
  update public.vendor_requests
     set registered_by = me, registered_at = now(), registration_method = m
   where id = target;

  if r.kind in ('new', 'change_bank') then
    if r.kind = 'change_bank' then
      -- The new account goes live and the old ones stop, in this one transaction.
      select coalesce(array_agg(id), '{}') into old_ids
        from public.vendor_bank_accounts
       where vendor_id = r.vendor_id and active and request_id is distinct from target;
      update public.vendor_bank_accounts set active = false where id = any (old_ids);
      if coalesce(array_length(old_ids, 1), 0) > 0 then
        perform public.vendor_event(r.vendor_id, target, 'bank_deactivated', '', jsonb_build_object('bank_account_ids', to_jsonb(old_ids)));
      end if;
    end if;
    update public.vendor_bank_accounts
       set active = true, verified_by = me, verified_at = now(), verification_method = m
     where request_id = target;
    perform public.vendor_event(r.vendor_id, target, 'bank_activated', m);
  elsif r.kind = 'legacy_review' then
    -- Accounts imported from the bank go live once the vendor is reviewed.
    update public.vendor_bank_accounts
       set active = true, verified_by = me, verified_at = now(), verification_method = m
     where vendor_id = r.vendor_id and verified_at is null;
    perform public.vendor_event(r.vendor_id, target, 'bank_activated', m);
  end if;
  -- change_details / reactivate: Payments updated (or re-enabled) the beneficiary at the bank; the
  -- accounts themselves don't change.
  perform set_config('app.vendor_fn', 'off', true);
  return 'registered';
end;
$$;

-- ── Reviews (legacy, yearly) and reactivation, started from the vendor's page ──
create or replace function public.start_vendor_review(vendor uuid, reason text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v public.vendors;
  me uuid := public.my_person_id();
  open_id uuid;
  new_id uuid;
  k text;
begin
  if me is null or not (public.is_admin() or public.is_finance() or public.has_duty('vendor_approver')) then
    raise exception 'Only Finance or vendor approvers can start a review.';
  end if;
  select * into v from public.vendors where id = vendor;
  if not found then raise exception 'Vendor not found.'; end if;
  if v.status = 'legacy_pending' then k := 'legacy_review';
  elsif v.status = 'suspended' then k := 'reactivate';
  elsif v.status = 'approved' and v.next_review_on is not null and v.next_review_on <= current_date + 30 then k := 'periodic_review';
  else raise exception 'This vendor doesn''t need a review yet.';
  end if;
  if k = 'reactivate' and length(btrim(coalesce(reason, ''))) < 5 then
    raise exception 'Say why the vendor should be reactivated.';
  end if;
  select id into open_id from public.vendor_requests
   where vendor_id = vendor and kind in ('legacy_review', 'reactivate', 'periodic_review')
     and (status in ('draft', 'submitted', 'pending_approval', 'needs_info')
          or (status = 'approved' and registered_at is null and public.vendor_kind_needs_bank(kind)))
   limit 1;
  if open_id is not null then return open_id; end if;

  perform set_config('app.vendor_fn', 'on', true);
  insert into public.vendor_requests (kind, vendor_id, payload, requester_person_id, created_by, department_id, company_ids,
                                      purpose, status, dept_confirmed_by, dept_confirmed_at, submitted_at, previous)
  values (k, vendor,
          jsonb_build_object('vendor', jsonb_build_object('legal_name', v.legal_name, 'dba', v.dba, 'country', v.country)),
          me, auth.uid(), 'finance', v.company_ids,
          left(coalesce(nullif(btrim(reason), ''),
               case k when 'legacy_review' then 'Review of a vendor already registered at the bank'
                      when 'periodic_review' then 'Yearly review' else 'Reactivation' end), 2000),
          'pending_approval', me, now(), now(), coalesce(public.vendor_snapshot(vendor), '{}'::jsonb))
  returning id into new_id;
  perform set_config('app.vendor_fn', 'off', true);
  return new_id;
end;
$$;

-- Kept for the phase-B screens: same as start_vendor_review without a reason.
create or replace function public.start_legacy_review(vendor uuid) returns uuid
language sql security definer set search_path = public as $$
  select public.start_vendor_review(vendor, '')
$$;

-- ── Suspend ─────────────────────────────────────────────────────────────────
create or replace function public.suspend_vendor(vendor uuid, reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v public.vendors;
  me uuid := public.my_person_id();
begin
  if me is null or not public.has_duty('vendor_approver') then raise exception 'Only vendor approvers can suspend a vendor.'; end if;
  if length(btrim(coalesce(reason, ''))) < 5 then raise exception 'Say why the vendor is being suspended.'; end if;
  select * into v from public.vendors where id = vendor for update;
  if not found then raise exception 'Vendor not found.'; end if;
  if v.status <> 'approved' then raise exception 'Only approved vendors can be suspended.'; end if;
  update public.vendors set status = 'suspended', suspended_at = now(), suspended_reason = left(btrim(reason), 2000) where id = vendor;
  perform public.vendor_event(vendor, null, 'suspended', btrim(reason));
  return 'suspended';
end;
$$;

revoke execute on function public.start_vendor_review(uuid, text), public.suspend_vendor(uuid, text),
  public.vendor_request_previous(uuid), public.vendor_kind_needs_bank(text), public.vendor_change_fields() from anon;

-- ── Emails ──────────────────────────────────────────────────────────────────
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('new_hire', 'offboarding', 'travel_submitted', 'travel_status', 'referral_submitted', 'referral_status',
                  'time_off_request', 'time_off_decision',
                  'vendor_submitted', 'vendor_approval', 'vendor_decision', 'vendor_registered',
                  'vendor_review_due', 'vendor_suspended'));

notify pgrst, 'reload schema';

commit;

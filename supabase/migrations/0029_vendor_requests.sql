-- Vendor Master List, phase B: requests, department confirmation, approvals, registration at the bank.
--
--   draft ──submit──▶ submitted ──dept head confirms──▶ pending_approval ──approvers──▶ approved ──Payments──▶ registered
--     ▲                   │  └─ reject / send back                │  └─ reject / send back            (registered_at set)
--     └──── needs_info ◀──┴───────────────────────────────────────┘
--
--   * Requests are drafts until submit_vendor_request(): the requester can't move the status any other
--     way (a trigger guards every protected column). Bank proof (voided check / bank letter) is required.
--   * Department head = a person holding a director / head / manager position in that department, or a
--     profile with role 'leader' there. A head who requests their own vendor confirms it on submit.
--     Departments with nobody in charge: Finance / admins confirm.
--   * Sanctions: the server screens the request against OFAC on submit and again before each approval
--     (set_vendor_request_screening, service role only). 'match' blocks approval until an approver
--     marks it a false positive with a note; 'possible_match' needs each approver's acknowledgement.
--   * Approvals: vendor_approver duty holders; how many = app_settings 'vendors'.required_approvals.
--     Nobody approves a request they requested or confirmed. Reaching the count applies the request to
--     vendors / vendor_bank_accounts in the same transaction (bank account inactive until registered).
--   * Registration: a Payments duty holder marks it registered at the bank, which activates the bank
--     account. Whoever requested, confirmed, cleared a sanctions hit or approved it can't register it
--     (Paulo may hold both duties, never two roles on one request).
--   * Payloads never carry full account / routing numbers (check constraint), only the last 4.
--   * Internal notes (sanctions false-positive notes) are hidden from requesters (column grants).

begin;

-- ── Columns ─────────────────────────────────────────────────────────────────
alter table public.vendor_requests
  add column if not exists submitted_at          timestamptz,
  add column if not exists decided_at            timestamptz,
  add column if not exists dept_note             text not null default '' check (length(dept_note) <= 2000),
  add column if not exists decision_note         text not null default '' check (length(decision_note) <= 2000),
  add column if not exists screening_score       numeric(4, 3),
  add column if not exists screening_checked_at  timestamptz,
  add column if not exists sanctions_cleared_by  uuid references public.people (id) on delete set null,
  add column if not exists sanctions_note        text not null default '' check (length(sanctions_note) <= 2000),
  add column if not exists registration_method   text not null default '' check (length(registration_method) <= 60);

alter table public.vendor_bank_accounts
  add column if not exists request_id uuid references public.vendor_requests (id) on delete set null;

-- No full bank numbers in a request, ever.
create or replace function public.vendor_payload_safe(p jsonb) returns boolean
language sql immutable as $$
  select not (coalesce(p, '{}'::jsonb) ?| array['account_number', 'routing_number', 'iban', 'account', 'routing', 'aba'])
     and not (coalesce(p -> 'bank', '{}'::jsonb) ?| array['account_number', 'routing_number', 'iban', 'account', 'routing', 'aba'])
     and length(coalesce(p -> 'bank' ->> 'account_last4', '')) <= 4
     and length(coalesce(p -> 'bank' ->> 'routing_last4', '')) <= 4
$$;
alter table public.vendor_requests drop constraint if exists vendor_requests_payload_safe;
alter table public.vendor_requests add constraint vendor_requests_payload_safe check (public.vendor_payload_safe(payload));

-- ── Who's who ───────────────────────────────────────────────────────────────
-- Heads of a department: director / head / manager positions there (level ≤ 3, or by title when the
-- level isn't set), or a 'leader' profile in that department.
create or replace function public.vendor_dept_heads(dept text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct pos.person_id
    from public.positions pos
    join public.people p on p.id = pos.person_id and p.active
   where dept is not null and pos.department_id = dept
     and (pos.level <= 3
          or (pos.level is null and pos.title ~* '(diretor|director|vp|vice[- ]?president|head|gerente|manager|gestor|jef[ea])'))
  union
  select p.id
    from public.profiles pr
    join public.people p on p.user_id = pr.user_id and p.active
   where dept is not null and pr.role = 'leader' and pr.department_id = dept
$$;

-- Departments whose vendor requests the caller confirms: where they're a head, plus (Finance /
-- admins) the departments nobody is in charge of.
create or replace function public.vendor_confirmable_departments() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id), '{}')
    from public.departments d
   where public.my_person_id() in (select public.vendor_dept_heads(d.id))
      or ((public.is_admin() or public.is_finance())
          and not exists (select 1 from public.vendor_dept_heads(d.id)))
$$;

create or replace function public.vendor_required_approvals() returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, coalesce((select (value ->> 'required_approvals')::int from public.app_settings where key = 'vendors'), 1))
$$;

-- Internal notes for vendor staff (hidden from requesters by column grants).
create or replace function public.vendor_request_internal(target uuid)
returns table (review_notes text, sanctions_note text, sanctions_cleared_by uuid)
language sql stable security definer set search_path = public as $$
  select r.review_notes, r.sanctions_note, r.sanctions_cleared_by
    from public.vendor_requests r
   where r.id = target and public.is_vendor_staff()
$$;

-- ── Guard: clients only edit drafts or cancel; every other move is a function below ──
create or replace function public.vendor_requests_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.vendor_fn', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A vendor request starts as a draft.'; end if;
    if new.kind <> 'new' then raise exception 'Reviews of existing vendors are started from the Master List.'; end if;
    new.vendor_id := null;
    new.dept_confirmed_by := null; new.dept_confirmed_at := null; new.dept_note := '';
    new.registered_by := null; new.registered_at := null; new.registration_method := '';
    new.screening_status := 'not_run'; new.screening_score := null; new.screening_checked_at := null;
    new.sanctions_cleared_by := null; new.sanctions_note := ''; new.review_notes := '';
    new.decision_note := ''; new.submitted_at := null; new.decided_at := null;
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
  return new;
end;
$$;
drop trigger if exists vendor_requests_guard on public.vendor_requests;
create trigger vendor_requests_guard before insert or update on public.vendor_requests
  for each row execute function public.vendor_requests_guard();

-- Field checks shared by submit and apply (raise a readable message instead of a constraint error).
create or replace function public.vendor_payload_check(p jsonb) returns void
language plpgsql immutable as $$
declare
  t text := coalesce(p -> 'vendor' ->> 'tax_id_type', '');
  m text := coalesce(p -> 'bank' ->> 'payment_method', '');
  s text := upper(coalesce(p -> 'bank' ->> 'swift_bic', ''));
  c text := upper(coalesce(nullif(p -> 'bank' ->> 'currency', ''), 'USD'));
begin
  if btrim(coalesce(p -> 'vendor' ->> 'legal_name', '')) = '' then raise exception 'Add the vendor''s legal name.'; end if;
  if length(p -> 'vendor' ->> 'legal_name') > 200 then raise exception 'The legal name is too long.'; end if;
  if t not in ('', 'ein', 'ssn_last4', 'itin', 'cnpj', 'cpf', 'vat', 'other') then raise exception 'Unknown tax id type.'; end if;
  if m not in ('', 'ach', 'wire', 'check', 'pix', 'other') then raise exception 'Unknown payment method.'; end if;
  if s <> '' and s !~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$' then raise exception 'The SWIFT / BIC code should have 8 or 11 letters and digits.'; end if;
  if c !~ '^[A-Z]{3}$' then raise exception 'The currency should be a 3-letter code (USD, BRL, EUR…).'; end if;
end;
$$;

-- ── Submit ──────────────────────────────────────────────────────────────────
create or replace function public.submit_vendor_request(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  me uuid := public.my_person_id();
  next_status text;
begin
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  if me is null or r.requester_person_id is distinct from me then
    raise exception 'Only the person who wrote the request can submit it.';
  end if;
  if r.status not in ('draft', 'needs_info') then raise exception 'This request was already submitted.'; end if;
  if r.kind = 'new' then
    perform public.vendor_payload_check(r.payload);
    if coalesce(array_length(r.company_ids, 1), 0) = 0 then raise exception 'Choose which company will pay this vendor.'; end if;
    if not exists (select 1 from public.vendor_files f where f.request_id = target and f.kind = 'bank_proof') then
      raise exception 'Attach the bank proof (voided check or bank letter).';
    end if;
  end if;
  if r.department_id is null and not public.has_duty('vendor_approver') then
    raise exception 'Choose the department this vendor is for.';
  end if;

  -- Already confirmed (sent back by approvers), requested by a head of the department, or by
  -- leadership (no department): straight to the approvers.
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
         dept_confirmed_by = case when next_status = 'pending_approval' and dept_confirmed_by is null then me else dept_confirmed_by end,
         dept_confirmed_at = case when next_status = 'pending_approval' and dept_confirmed_at is null then now() else dept_confirmed_at end
   where id = target;
  -- A resubmitted request starts its approvals over.
  delete from public.vendor_request_approvals where request_id = target;
  perform set_config('app.vendor_fn', 'off', true);
  return next_status;
end;
$$;

-- ── Department confirmation ─────────────────────────────────────────────────
create or replace function public.confirm_vendor_request(target uuid, decision text, note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  me uuid := public.my_person_id();
  next_status text;
begin
  if decision not in ('confirm', 'reject', 'needs_info') then raise exception 'Unknown decision.'; end if;
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'submitted' then raise exception 'This request isn''t waiting for the department.'; end if;
  if me is null or me = r.requester_person_id then raise exception 'You can''t confirm your own request.'; end if;
  if r.department_id is null or not (r.department_id = any (public.vendor_confirmable_departments())) then
    raise exception 'Only the head of this department can confirm it.';
  end if;
  if decision <> 'confirm' and length(btrim(coalesce(note, ''))) = 0 then raise exception 'Say why, for the requester.'; end if;

  next_status := case decision when 'confirm' then 'pending_approval' when 'reject' then 'rejected' else 'needs_info' end;
  perform set_config('app.vendor_fn', 'on', true);
  update public.vendor_requests
     set status = next_status,
         dept_confirmed_by = case when decision = 'confirm' then me else dept_confirmed_by end,
         dept_confirmed_at = case when decision = 'confirm' then now() else dept_confirmed_at end,
         dept_note = coalesce(btrim(note), ''),
         decision_note = case when decision = 'confirm' then decision_note else coalesce(btrim(note), '') end,
         decided_at = case when decision = 'reject' then now() else decided_at end
   where id = target;
  perform set_config('app.vendor_fn', 'off', true);
  return next_status;
end;
$$;

-- ── Applying an approved request ────────────────────────────────────────────
create or replace function public.apply_vendor_request(target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  v jsonb; b jsonb; d jsonb;
  months int := greatest(1, coalesce((select (value ->> 'review_months')::int from public.app_settings where key = 'vendors'), 12));
  vid uuid;
  sanctions text;
begin
  select * into r from public.vendor_requests where id = target for update;
  v := coalesce(r.payload -> 'vendor', '{}'::jsonb);
  b := coalesce(r.payload -> 'bank', '{}'::jsonb);
  d := coalesce(r.payload -> 'details', '{}'::jsonb);
  sanctions := r.screening_status;

  if r.kind = 'new' then
    perform public.vendor_payload_check(r.payload);
    insert into public.vendors (company_ids, legal_name, dba, country, tax_id, tax_id_type, category, address, contact,
                                website, currency, payment_terms, status, approved_at, next_review_on, source,
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
            'approved', now(), (now() + make_interval(months => months))::date, 'request',
            sanctions, r.screening_score, r.screening_checked_at, r.sanctions_cleared_by, r.sanctions_note)
    returning id into vid;
  else
    vid := r.vendor_id;
    if vid is null then raise exception 'This request has no vendor.'; end if;
  end if;

  if r.kind in ('legacy_review', 'reactivate') then
    update public.vendors
       set status = 'approved', approved_at = now(), next_review_on = (now() + make_interval(months => months))::date,
           sanctions_status = case when sanctions = 'not_run' then sanctions_status else sanctions end,
           sanctions_score = coalesce(r.screening_score, sanctions_score),
           sanctions_checked_at = coalesce(r.screening_checked_at, sanctions_checked_at),
           sanctions_cleared_by = coalesce(r.sanctions_cleared_by, sanctions_cleared_by),
           sanctions_cleared_note = case when r.sanctions_note <> '' then r.sanctions_note else sanctions_cleared_note end
     where id = vid;
  elsif r.kind = 'change_details' then
    update public.vendors
       set legal_name = coalesce(nullif(btrim(v ->> 'legal_name'), ''), legal_name),
           dba = coalesce(v ->> 'dba', dba),
           country = coalesce(v ->> 'country', country),
           tax_id = coalesce(v ->> 'tax_id', tax_id),
           address = coalesce(v -> 'address', address),
           contact = coalesce(v -> 'contact', contact),
           website = coalesce(v ->> 'website', website),
           company_ids = case when coalesce(array_length(r.company_ids, 1), 0) > 0 then r.company_ids else company_ids end
     where id = vid;
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
            false);
  end if;

  update public.vendor_requests set vendor_id = vid where id = target;
  return vid;
end;
$$;
revoke execute on function public.apply_vendor_request(uuid) from public, anon, authenticated;

-- ── Approval ────────────────────────────────────────────────────────────────
create or replace function public.approve_vendor_request(
  target uuid, decision text, comment text default '', ack boolean default false, false_positive_note text default ''
) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  me uuid := public.my_person_id();
  approvals int;
  next_status text;
begin
  if decision not in ('approve', 'reject', 'needs_info') then raise exception 'Unknown decision.'; end if;
  if me is null or not public.has_duty('vendor_approver') then raise exception 'Only vendor approvers can decide this.'; end if;
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'pending_approval' then raise exception 'This request isn''t waiting for approval.'; end if;
  if me = r.requester_person_id then raise exception 'You can''t approve a request you made.'; end if;
  if me = r.dept_confirmed_by then raise exception 'You confirmed this request for the department, so someone else has to approve it.'; end if;
  if me = r.registered_by then raise exception 'You registered this vendor at the bank, so someone else has to approve it.'; end if;
  if exists (select 1 from public.vendor_request_approvals a where a.request_id = target and a.approver_person_id = me) then
    raise exception 'You already decided on this request.';
  end if;
  if decision <> 'approve' and length(btrim(coalesce(comment, ''))) = 0 then raise exception 'Say why, for the requester.'; end if;

  perform set_config('app.vendor_fn', 'on', true);
  if decision = 'approve' then
    if r.screening_status = 'not_run' then
      raise exception 'The sanctions check hasn''t run for this request yet. Try again in a moment.';
    elsif r.screening_status = 'match' then
      if length(btrim(coalesce(false_positive_note, ''))) < 10 then
        raise exception 'The vendor matches the OFAC sanctions list. To approve it, explain why it''s a false positive.';
      end if;
      update public.vendor_requests
         set screening_status = 'false_positive', sanctions_cleared_by = me, sanctions_note = btrim(false_positive_note)
       where id = target;
    elsif r.screening_status = 'possible_match' and not coalesce(ack, false) then
      raise exception 'Confirm you checked the possible sanctions match before approving.';
    end if;

    insert into public.vendor_request_approvals (request_id, approver_person_id, decision, comment, screening_acknowledged)
    values (target, me, 'approve', coalesce(btrim(comment), ''), coalesce(ack, false) or r.screening_status = 'match');

    select count(*) into approvals from public.vendor_request_approvals a where a.request_id = target and a.decision = 'approve';
    if approvals >= public.vendor_required_approvals() then
      perform public.apply_vendor_request(target);
      update public.vendor_requests set status = 'approved', decided_at = now() where id = target;
      next_status := 'approved';
    else
      next_status := 'pending_approval';
    end if;
  elsif decision = 'reject' then
    insert into public.vendor_request_approvals (request_id, approver_person_id, decision, comment)
    values (target, me, 'reject', btrim(comment));
    update public.vendor_requests set status = 'rejected', decision_note = btrim(comment), decided_at = now() where id = target;
    next_status := 'rejected';
  else
    update public.vendor_requests set status = 'needs_info', decision_note = btrim(comment) where id = target;
    next_status := 'needs_info';
  end if;
  perform set_config('app.vendor_fn', 'off', true);
  return next_status;
end;
$$;

-- ── Registration at the bank (Payments) ─────────────────────────────────────
create or replace function public.register_vendor(target uuid, method text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  me uuid := public.my_person_id();
begin
  if me is null or not public.has_duty('payments') then raise exception 'Only Payments can register vendors at the bank.'; end if;
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status <> 'approved' or r.registered_at is not null then raise exception 'This vendor isn''t waiting to be registered.'; end if;
  if me = r.requester_person_id or me = r.dept_confirmed_by or me = r.sanctions_cleared_by
     or exists (select 1 from public.vendor_request_approvals a where a.request_id = target and a.approver_person_id = me) then
    raise exception 'You had another role on this request, so someone else from Payments has to register it.';
  end if;

  perform set_config('app.vendor_fn', 'on', true);
  update public.vendor_requests
     set registered_by = me, registered_at = now(), registration_method = left(coalesce(btrim(method), ''), 60)
   where id = target;
  if r.kind in ('new', 'change_bank') then
    update public.vendor_bank_accounts
       set active = true, verified_by = me, verified_at = now(), verification_method = left(coalesce(btrim(method), ''), 60)
     where request_id = target;
    if r.kind = 'change_bank' then
      update public.vendor_bank_accounts set active = false
       where vendor_id = r.vendor_id and (request_id is distinct from target);
    end if;
  else
    update public.vendor_bank_accounts
       set active = true, verified_by = me, verified_at = now(), verification_method = left(coalesce(btrim(method), ''), 60)
     where vendor_id = r.vendor_id;
  end if;
  perform set_config('app.vendor_fn', 'off', true);
  return 'registered';
end;
$$;

-- ── Reviewing a vendor that's already at the bank ───────────────────────────
create or replace function public.start_legacy_review(vendor uuid) returns uuid
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
  elsif v.status = 'approved' and v.next_review_on is not null and v.next_review_on <= current_date then k := 'reactivate';
  else raise exception 'This vendor doesn''t need a review.';
  end if;
  select id into open_id from public.vendor_requests
   where vendor_id = vendor and status in ('draft', 'submitted', 'pending_approval', 'needs_info') limit 1;
  if open_id is not null then return open_id; end if;

  perform set_config('app.vendor_fn', 'on', true);
  insert into public.vendor_requests (kind, vendor_id, payload, requester_person_id, created_by, department_id, company_ids,
                                      purpose, status, dept_confirmed_by, dept_confirmed_at, submitted_at)
  values (k, vendor,
          jsonb_build_object('vendor', jsonb_build_object('legal_name', v.legal_name, 'dba', v.dba, 'country', v.country)),
          me, auth.uid(), 'finance', v.company_ids,
          case k when 'legacy_review' then 'Review of a vendor already registered at the bank' else 'Yearly review' end,
          'pending_approval', me, now(), now())
  returning id into new_id;
  perform set_config('app.vendor_fn', 'off', true);
  return new_id;
end;
$$;

-- ── Sanctions result on a request (server only) ─────────────────────────────
create or replace function public.set_vendor_request_screening(
  target uuid, result text, score numeric, matches jsonb, list_version text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.vendor_requests;
  next_status text;
begin
  if result not in ('clear', 'possible_match', 'match') then raise exception 'Unknown screening result.'; end if;
  select * into r from public.vendor_requests where id = target for update;
  if not found then raise exception 'Request not found.'; end if;
  -- A hit approvers already cleared stays cleared unless it gets stronger.
  next_status := case
    when r.screening_status = 'false_positive' and result <> 'clear' and coalesce(score, 0) <= coalesce(r.screening_score, 0) + 0.001
      then 'false_positive'
    else result end;
  perform set_config('app.vendor_fn', 'on', true);
  update public.vendor_requests
     set screening_status = next_status, screening_score = score, screening_checked_at = now()
   where id = target;
  perform set_config('app.vendor_fn', 'off', true);
  insert into public.vendor_screenings (vendor_id, request_id, screened_name, result, score, matches, list_version, trigger)
  values (r.vendor_id, target, coalesce(r.payload -> 'vendor' ->> 'legal_name', ''), result, coalesce(score, 0),
          coalesce(matches, '[]'::jsonb), coalesce(list_version, ''), 'request');
  return next_status;
end;
$$;
revoke execute on function public.set_vendor_request_screening(uuid, text, numeric, jsonb, text) from public, anon, authenticated;
grant execute on function public.set_vendor_request_screening(uuid, text, numeric, jsonb, text) to service_role;

revoke execute on function public.submit_vendor_request(uuid), public.confirm_vendor_request(uuid, text, text),
  public.approve_vendor_request(uuid, text, text, boolean, text), public.register_vendor(uuid, text),
  public.start_legacy_review(uuid), public.vendor_request_internal(uuid), public.vendor_confirmable_departments(),
  public.vendor_dept_heads(text), public.vendor_required_approvals() from anon;

-- ── Row-level security ──────────────────────────────────────────────────────
-- Internal notes are only readable through vendor_request_internal().
revoke select on public.vendor_requests from authenticated;
grant select (id, kind, vendor_id, payload, requester_person_id, created_by, department_id, company_ids, purpose, status,
              dept_confirmed_by, dept_confirmed_at, screening_status, registered_by, registered_at, created_at, updated_at,
              submitted_at, decided_at, dept_note, decision_note, screening_score, screening_checked_at, registration_method)
  on public.vendor_requests to authenticated;

drop policy if exists "read vendor requests" on public.vendor_requests;
create policy "read vendor requests" on public.vendor_requests for select to authenticated using (
  requester_person_id = public.my_person_id() or public.is_vendor_staff()
  or (department_id is not null and department_id = any (public.vendor_confirmable_departments()))
);
drop policy if exists "draft vendor requests" on public.vendor_requests;
create policy "draft vendor requests" on public.vendor_requests for insert to authenticated with check (
  created_by = auth.uid() and requester_person_id = public.my_person_id() and status = 'draft' and kind = 'new'
);
drop policy if exists "edit own draft vendor requests" on public.vendor_requests;
create policy "edit own vendor requests" on public.vendor_requests for update to authenticated
  using (requester_person_id = public.my_person_id() and status in ('draft', 'submitted', 'needs_info', 'pending_approval'))
  with check (requester_person_id = public.my_person_id() and status in ('draft', 'needs_info', 'cancelled'));

drop policy if exists "read vendor approvals" on public.vendor_request_approvals;
create policy "read vendor approvals" on public.vendor_request_approvals for select to authenticated using (
  public.is_vendor_staff()
  or exists (select 1 from public.vendor_requests r where r.id = request_id
             and (r.requester_person_id = public.my_person_id()
                  or (r.department_id is not null and r.department_id = any (public.vendor_confirmable_departments()))))
);
drop policy if exists "read vendor request events" on public.vendor_request_events;
create policy "read vendor request events" on public.vendor_request_events for select to authenticated using (
  public.is_vendor_staff()
  or exists (select 1 from public.vendor_requests r where r.id = request_id
             and (r.requester_person_id = public.my_person_id()
                  or (r.department_id is not null and r.department_id = any (public.vendor_confirmable_departments()))))
);

-- Files: the requester attaches to their own draft; department heads see their department's.
drop policy if exists "read vendor files" on public.vendor_files;
create policy "read vendor files" on public.vendor_files for select to authenticated using (
  uploaded_by = auth.uid() or public.is_vendor_staff()
  or exists (select 1 from public.vendor_requests r where r.id = request_id
             and r.department_id is not null and r.department_id = any (public.vendor_confirmable_departments()))
);
drop policy if exists "upload vendor files" on public.vendor_files;
create policy "upload vendor files" on public.vendor_files for insert to authenticated with check (
  uploaded_by = auth.uid() and split_part(path, '/', 1) = auth.uid()::text and request_id is not null
  and exists (select 1 from public.vendor_requests r where r.id = request_id
              and r.requester_person_id = public.my_person_id() and r.status in ('draft', 'needs_info'))
);
drop policy if exists "remove own vendor files" on public.vendor_files;
create policy "remove own vendor files" on public.vendor_files for delete to authenticated using (
  uploaded_by = auth.uid() and request_id is not null
  and exists (select 1 from public.vendor_requests r where r.id = request_id and r.status in ('draft', 'needs_info'))
);

-- ── Emails ──────────────────────────────────────────────────────────────────
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('new_hire', 'offboarding', 'travel_submitted', 'travel_status', 'referral_submitted', 'referral_status',
                  'time_off_request', 'time_off_decision',
                  'vendor_submitted', 'vendor_approval', 'vendor_decision', 'vendor_registered'));

notify pgrst, 'reload schema';

commit;

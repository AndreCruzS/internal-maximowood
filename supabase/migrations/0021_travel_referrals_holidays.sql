-- From the Lumber Plus "GMX Employee Portal": travel policy + travel requests (Finance /
-- Procurement), refer a candidate (HR / Recruiting) and holidays by office with opening
-- hours (HR). Content (policy text, open roles, 2026 US holiday schedules) copied from
-- that portal on 2026-10-16; HR should confirm it.

begin;

-- ── Settings & duties ───────────────────────────────────────────────────────
-- Small admin-managed settings (which playbook is the travel policy, referral bonus text…).
create table public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
grant select, insert, update, delete on public.app_settings to authenticated;
create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "admins write settings" on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- People who hold a duty outside their department: Procurement (travel), Recruiting (referrals).
create table public.duty_holders (
  duty      text not null check (duty in ('procurement', 'recruiting')),
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (duty, person_id)
);
alter table public.duty_holders enable row level security;
grant select, insert, delete on public.duty_holders to authenticated;
create policy "read duties" on public.duty_holders for select to authenticated using (true);
create policy "admins manage duties" on public.duty_holders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.has_duty(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.duty_holders h where h.duty = d and h.person_id = public.my_person_id())
$$;
create or replace function public.is_procurement() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.in_department('finance') or public.has_duty('procurement'), false)
$$;
create or replace function public.is_recruiting() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.in_department('hr') or public.has_duty('recruiting'), false)
$$;
create or replace function public.is_hr_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.in_department('hr'), false)
$$;

-- New email kinds.
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('new_hire', 'offboarding', 'travel_submitted', 'travel_status', 'referral_submitted', 'referral_status'));

-- ── Travel policy (a must-read playbook in HR) ──────────────────────────────
insert into public.playbooks (id, department_id, kind, template, title, summary, category, body, steps, definitions, resources, status, ack_required, language)
values (
  'b7a1e0c2-5d3f-4e8a-9c61-7f2d0a4b1e01', 'hr', 'policy', 'policy', 'Travel Policy',
  'Employee Handbook · Centralized Buyer edition · version 112425_V2_GT. How business travel is requested and booked, and what is reimbursable.',
  'Travel',
  E'The policy establishes consistent, cost-effective and safe business-travel standards across GMX Group. A Centralized Travel Buyer coordinates all major travel components.\n\n• Major bookings follow one centralized Procurement workflow.\n• Employees handle only eligible local expenses during the trip.\n• The policy applies to every company within GMX Group.',
  jsonb_build_array(
    jsonb_build_object('title', 'Travel requests', 'body', E'Business travel requests go directly to the Centralized Travel Buyer. Submit the Travel Request at least 15 days before departure whenever possible.\n\n• Employees must not book airfare, hotels or rental cars directly.\n• Flag urgent travel in the request so Procurement can prioritize it.\n• Review request details and track booking progress under Travel Requests.'),
    jsonb_build_object('title', 'Centralized Travel Buyer', 'body', E'The Centralized Travel Buyer books approved airfare, hotels and rental vehicles, confirms policy compliance and coordinates the itinerary with the employee.\n\n• The Buyer manages corporate accounts, negotiated rates and vendors.\n• Employees may book major components only with explicit C-Level authorization.\n• Procurement sends compliant options through the intranet.'),
    jsonb_build_object('title', 'Employee responsibilities', 'body', E'Employees must submit complete and accurate details, follow the approved itinerary and promptly report changes or cancellations through the intranet.\n\n• Do not submit passport, payment-card or medical data in the request.\n• Keep itemized receipts for eligible local expenses.\n• Submit monthly expense reports with date, location and business purpose.'),
    jsonb_build_object('title', 'Eligible local expenses', 'body', E'GMX Group does not provide travel cash advances. Employees use personal funds or personal credit cards for reasonable local expenses and request reimbursement afterward.\n\n• Eligible items include meals, incidentals, rideshare, taxis, public transit, parking, tolls and necessary minor business supplies.\n• Meals and incidentals are limited to $100 per day; receipts are required.\n• Alcohol, minibar, movies and other personal charges are not reimbursable.'),
    jsonb_build_object('title', 'Air, lodging and rental standards', 'body', E'Airfare, hotels and rental vehicles are purchased by the Centralized Travel Buyer and are not employee-reimbursable expenses.\n\n• Economy airfare is required; personally funded upgrades are permitted.\n• Hotels should be affordable 3- or 4-star properties near the business destination.\n• Intermediate-class rental cars are the standard; rideshare or transit should be used when appropriate.'),
    jsonb_build_object('title', 'Family and personal vehicles', 'body', E'Family travel is covered only when essential to the business purpose and approved in advance by a C-Level Executive. Business use of a personal vehicle also requires advance C-Level approval.\n\n• The Centralized Travel Buyer must receive family-travel approval before booking.\n• Approved personal-vehicle mileage follows the IRS mileage rate.\n• Home-to-primary-office commuting is not reimbursable.'),
    jsonb_build_object('title', 'Compliance and approval', 'body', E'Non-compliance can result in denied reimbursement, disciplinary action or revocation of travel privileges. The Company may update this policy at any time.\n\n• Approved by Joao Fugiwara.\n• Reviewed annually.\n• Policy version 112425_v2_GT.')
  ),
  jsonb_build_array(
    jsonb_build_object('term', 'Airfare', 'definition', 'Centralized Travel Buyer · Economy class'),
    jsonb_build_object('term', 'Hotels', 'definition', 'Centralized Travel Buyer · Affordable 3- or 4-star'),
    jsonb_build_object('term', 'Rental cars', 'definition', 'Centralized Travel Buyer · Intermediate class'),
    jsonb_build_object('term', 'Meals & incidentals', 'definition', 'Employee, then reimbursement · $100/day with receipts'),
    jsonb_build_object('term', 'Local transportation', 'definition', 'Employee, then reimbursement · Reasonable and necessary')
  ),
  '[]'::jsonb, 'published', true, 'en'
) on conflict (id) do nothing;

insert into public.app_settings (key, value) values
  ('travel_policy', jsonb_build_object('playbook_id', 'b7a1e0c2-5d3f-4e8a-9c61-7f2d0a4b1e01')),
  ('referral_program', jsonb_build_object(
    'reward', 'If they''re hired and stay 90 days, you get $1,500 ($500 for contractor placements).',
    'review', 'Recruiting reviews every referral within five business days and keeps you posted.'))
on conflict (key) do nothing;

-- ── Travel requests ─────────────────────────────────────────────────────────
create table public.travel_requests (
  id                  uuid primary key default gen_random_uuid(),
  requester_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  requester_person_id uuid references public.people (id) on delete set null,
  traveler_type       text not null default 'self' check (traveler_type in ('self', 'employee', 'guest')),
  traveler_person_id  uuid references public.people (id) on delete set null,
  guest_name          text not null default '' check (length(guest_name) <= 120),
  guest_email         text not null default '' check (guest_email = '' or guest_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  department_id       text references public.departments (id),
  project_client      text not null default '' check (length(project_client) <= 200),
  purpose             text not null check (length(btrim(purpose)) > 0 and length(purpose) <= 2000),
  urgency             smallint not null default 2 check (urgency between 1 and 5),
  trip_type           text not null default 'round' check (trip_type in ('one_way', 'round', 'multi')),
  legs                jsonb not null default '[]'::jsonb check (jsonb_typeof(legs) = 'array'),    -- [{mode, origin, destination, date, time, luggage, seat, cabin}]
  hotels              jsonb not null default '[]'::jsonb check (jsonb_typeof(hotels) = 'array'),  -- [{city, area, check_in, check_out, guests, stars}]
  cars                jsonb not null default '[]'::jsonb check (jsonb_typeof(cars) = 'array'),    -- [{pickup, dropoff, pickup_on, return_on, vehicle}]
  depart_on           date,   -- first leg / stay, for sorting and the 15-day rule
  notes               text not null default '' check (length(notes) <= 2000),
  policy_version      integer,
  policy_acked_at     timestamptz,
  status              text not null default 'submitted'
                      check (status in ('submitted', 'in_review', 'options_sent', 'booked', 'completed', 'cancelled')),
  buyer_person_id     uuid references public.people (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (traveler_type <> 'employee' or traveler_person_id is not null),
  check (traveler_type <> 'guest' or length(btrim(guest_name)) > 0)
);
create index travel_requests_requester_idx on public.travel_requests (requester_id, created_at desc);
create index travel_requests_status_idx on public.travel_requests (status, depart_on);
create trigger travel_requests_updated_at before update on public.travel_requests for each row execute function public.set_updated_at();

-- Procurement-only notes, kept apart so they're never sent to the requester.
create table public.travel_internal (
  request_id uuid primary key references public.travel_requests (id) on delete cascade,
  notes      text not null default '' check (length(notes) <= 5000),
  updated_at timestamptz not null default now()
);
-- Status changes, change requests from the traveler and messages from Procurement.
create table public.travel_request_events (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.travel_requests (id) on delete cascade,
  kind       text not null check (kind in ('status', 'change', 'message')),
  from_status text,
  to_status   text,
  note       text not null default '' check (length(note) <= 2000),
  by_user    uuid default auth.uid() references auth.users (id) on delete set null,
  at         timestamptz not null default now()
);
create index travel_events_idx on public.travel_request_events (request_id, at);
-- Options and booking documents Procurement uploads (private bucket "travel").
create table public.travel_request_files (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.travel_requests (id) on delete cascade,
  kind        text not null default 'document' check (kind in ('option', 'document')),
  path        text not null,
  name        text not null default '',
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- The travel policy confirmation the requester has for the current version (null = none).
create or replace function public.my_travel_policy_ack() returns table (version integer, acked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select k.version, k.acked_at
    from public.app_settings s
    join public.playbooks p on p.id = (s.value->>'playbook_id')::uuid
    join public.playbook_acks k on k.playbook_id = p.id and k.user_id = auth.uid()
   where s.key = 'travel_policy' and k.version >= p.ack_version
$$;

-- New requests: always "submitted", by the caller, with the current travel policy accepted.
create or replace function public.travel_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pb uuid := (select (value->>'playbook_id')::uuid from public.app_settings where key = 'travel_policy');
  ack record;
begin
  new.requester_id := auth.uid();
  new.requester_person_id := public.my_person_id();
  new.status := 'submitted';
  new.buyer_person_id := null;
  if pb is not null and exists (select 1 from public.playbooks where id = pb and status = 'published') then
    select * into ack from public.my_travel_policy_ack() limit 1;
    if ack is null or ack.version is null then
      raise exception 'Accept the current Travel Policy before submitting a travel request';
    end if;
    new.policy_version := ack.version;
    new.policy_acked_at := ack.acked_at;
  end if;
  return new;
end $$;
create trigger travel_requests_insert before insert on public.travel_requests
  for each row execute function public.travel_before_insert();

-- Requesters edit only while "submitted" and can only cancel; Procurement moves the status.
create or replace function public.travel_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.requester_id := old.requester_id;
  new.requester_person_id := old.requester_person_id;
  new.policy_version := old.policy_version;
  new.policy_acked_at := old.policy_acked_at;
  if not public.is_procurement() then
    new.buyer_person_id := old.buyer_person_id;
    if new.status is distinct from old.status
       and not (new.status = 'cancelled' and old.status in ('submitted', 'in_review', 'options_sent')) then
      raise exception 'Only Procurement can change the status of a travel request';
    end if;
    if old.status <> 'submitted'
       and (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'This request is already being handled — send Procurement a change request instead';
    end if;
  end if;
  return new;
end $$;
create trigger travel_requests_update before update on public.travel_requests
  for each row execute function public.travel_before_update();

create or replace function public.travel_log_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.travel_request_events (request_id, kind, from_status, to_status, by_user)
    values (new.id, 'status', old.status, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger travel_requests_log after update on public.travel_requests
  for each row execute function public.travel_log_status();

-- The traveler asks for a change (or explains a cancellation) once it's being handled.
create or replace function public.travel_change_request(request uuid, note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (select 1 from public.travel_requests r where r.id = request and r.requester_id = auth.uid()) then
    raise exception 'Not your travel request';
  end if;
  if length(btrim(coalesce(note, ''))) = 0 then raise exception 'Describe the change'; end if;
  insert into public.travel_request_events (request_id, kind, note, by_user)
  values (request, 'change', left(btrim(note), 2000), auth.uid()) returning travel_request_events.id into new_id;
  return new_id;
end $$;
grant execute on function public.travel_change_request(uuid, text) to authenticated;

alter table public.travel_requests enable row level security;
alter table public.travel_internal enable row level security;
alter table public.travel_request_events enable row level security;
alter table public.travel_request_files enable row level security;
grant select, insert, update, delete on public.travel_requests, public.travel_internal, public.travel_request_files to authenticated;
grant select, insert on public.travel_request_events to authenticated;

-- Takes text so a storage path that isn't a request id simply doesn't match (no cast errors).
create or replace function public.can_see_travel(request text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_procurement() or exists (select 1 from public.travel_requests r where r.id::text = request and r.requester_id = auth.uid())
$$;

create policy "see travel" on public.travel_requests for select to authenticated
  using (requester_id = auth.uid() or public.is_procurement());
create policy "request travel" on public.travel_requests for insert to authenticated
  with check (requester_id = auth.uid());
create policy "update travel" on public.travel_requests for update to authenticated
  using (requester_id = auth.uid() or public.is_procurement())
  with check (requester_id = auth.uid() or public.is_procurement());
create policy "procurement deletes travel" on public.travel_requests for delete to authenticated
  using (public.is_admin());

create policy "procurement notes" on public.travel_internal for all to authenticated
  using (public.is_procurement()) with check (public.is_procurement());

create policy "see travel events" on public.travel_request_events for select to authenticated
  using (public.can_see_travel(request_id::text));
create policy "procurement messages" on public.travel_request_events for insert to authenticated
  with check (kind = 'message' and public.is_procurement() and by_user = auth.uid());

create policy "see travel files" on public.travel_request_files for select to authenticated
  using (public.can_see_travel(request_id::text));
create policy "procurement files" on public.travel_request_files for insert to authenticated
  with check (public.is_procurement());
create policy "procurement removes files" on public.travel_request_files for delete to authenticated
  using (public.is_procurement());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel', 'travel', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
-- Files live at "<request id>/<random>.<ext>".
create policy "travel files: read" on storage.objects for select to authenticated
  using (bucket_id = 'travel' and public.can_see_travel((storage.foldername(name))[1]));
create policy "travel files: procurement uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'travel' and public.is_procurement());
create policy "travel files: procurement removes" on storage.objects for delete to authenticated
  using (bucket_id = 'travel' and public.is_procurement());

-- ── Refer a candidate ───────────────────────────────────────────────────────
create table public.open_roles (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(btrim(title)) > 0),
  company_label   text not null default '',   -- "Lumber Plus", "GMX Logistics"… (free text: not every unit is a brand)
  location        text not null default '',
  employment_type text not null default 'w2' check (employment_type in ('w2', '1099', 'clt', 'pj', 'other')),
  status          text not null default 'open' check (status in ('open', 'closed')),
  sort            integer not null default 0,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create table public.referrals (
  id                  uuid primary key default gen_random_uuid(),
  referrer_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  referrer_person_id  uuid references public.people (id) on delete set null,
  candidate_name      text not null check (length(btrim(candidate_name)) > 0 and length(candidate_name) <= 120),
  candidate_email     text not null check (candidate_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id             uuid references public.open_roles (id) on delete set null,
  resume_path         text,
  resume_name         text not null default '',
  note                text not null default '' check (length(note) <= 2000),
  status              text not null default 'submitted'
                      check (status in ('submitted', 'in_review', 'interviewing', 'hired', 'not_selected')),
  hired_on            date,
  bonus_eligible_on   date generated always as (hired_on + 90) stored,
  bonus_paid          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create trigger referrals_updated_at before update on public.referrals for each row execute function public.set_updated_at();
create table public.referral_internal (
  referral_id uuid primary key references public.referrals (id) on delete cascade,
  notes       text not null default '' check (length(notes) <= 5000),
  updated_at  timestamptz not null default now()
);

create or replace function public.referral_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.referrer_id := auth.uid();
  new.referrer_person_id := public.my_person_id();
  new.status := 'submitted';
  new.hired_on := null;
  new.bonus_paid := false;
  if new.resume_path is not null and split_part(new.resume_path, '/', 1) <> auth.uid()::text then
    raise exception 'Upload the resume first';
  end if;
  return new;
end $$;
create trigger referrals_insert before insert on public.referrals
  for each row execute function public.referral_before_insert();

alter table public.open_roles enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_internal enable row level security;
grant select, insert, update, delete on public.open_roles, public.referrals, public.referral_internal to authenticated;
create policy "read roles" on public.open_roles for select to authenticated using (status = 'open' or public.is_recruiting());
create policy "recruiting manages roles" on public.open_roles for all to authenticated
  using (public.is_recruiting()) with check (public.is_recruiting());
create policy "see referrals" on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or public.is_recruiting());
create policy "refer" on public.referrals for insert to authenticated with check (referrer_id = auth.uid());
create policy "recruiting updates referrals" on public.referrals for update to authenticated
  using (public.is_recruiting()) with check (public.is_recruiting());
create policy "withdraw referral" on public.referrals for delete to authenticated
  using ((referrer_id = auth.uid() and status = 'submitted') or public.is_admin());
create policy "recruiting notes" on public.referral_internal for all to authenticated
  using (public.is_recruiting()) with check (public.is_recruiting());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referrals', 'referrals', false, 5242880, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
-- Resumes at "<referrer auth uid>/<random>.<ext>": only Recruiting opens them.
create policy "resumes: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'referrals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resumes: recruiting reads" on storage.objects for select to authenticated
  using (bucket_id = 'referrals' and public.is_recruiting());
create policy "resumes: remove" on storage.objects for delete to authenticated
  using (bucket_id = 'referrals' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_recruiting()));

-- Roles listed on the Lumber Plus portal (HR: confirm or close them).
insert into public.open_roles (title, company_label, location, employment_type, sort) values
  ('Showroom Sales Associate', 'Lumber Plus', 'Fort Lauderdale, FL', 'w2', 1),
  ('Inside Sales Representative', 'Lumber Plus', 'Remote — US', 'w2', 2),
  ('Logistics Coordinator', 'GMX Logistics', 'Houston, TX', 'w2', 3),
  ('Field Installation Contractor', 'GMX Field Services', 'Multiple markets', '1099', 4),
  ('Marketing Designer', 'Lumber Plus', 'Fort Lauderdale, FL', 'w2', 5),
  ('Payroll & Benefits Analyst', 'GMX Group', 'Fort Lauderdale, FL', 'w2', 6);

-- ── Holidays by office ──────────────────────────────────────────────────────
-- Calendars: GMX office (US), Lumber Plus store (US), Brazil national, Curitiba (city; shown with national).
create table public.office_holidays (
  id         uuid primary key default gen_random_uuid(),
  calendar   text not null check (calendar in ('gmx-us', 'lumberplus-us', 'br', 'curitiba')),
  day        date not null,
  name       text not null check (length(btrim(name)) > 0),
  kind       text not null default 'closed' check (kind in ('closed', 'reduced')),
  opens      time,
  closes     time,
  note       text not null default '',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (calendar, day),
  check (kind = 'closed' or (opens is not null and closes is not null and closes > opens))
);
create index office_holidays_day_idx on public.office_holidays (day);
alter table public.office_holidays enable row level security;
grant select, insert, update, delete on public.office_holidays to authenticated;
create policy "read holidays" on public.office_holidays for select to authenticated using (true);
create policy "hr manages holidays" on public.office_holidays for all to authenticated
  using (public.is_hr_editor()) with check (public.is_hr_editor());

-- HR can record time off for anyone (people still add their own).
create policy "hr manages absences" on public.absences for all to authenticated
  using (public.is_hr_editor()) with check (public.is_hr_editor());

-- 2026 company schedule (US dates follow the company schedule, not the federal calendar).
insert into public.office_holidays (calendar, day, name, kind, opens, closes, note) values
  ('gmx-us', '2026-01-01', 'New Year''s Day', 'closed', null, null, ''),
  ('gmx-us', '2026-05-25', 'Memorial Day', 'closed', null, null, ''),
  ('gmx-us', '2026-07-03', 'Independence Day (observed)', 'closed', null, null, 'Saturday holiday observed on Friday'),
  ('gmx-us', '2026-09-07', 'Labor Day', 'closed', null, null, ''),
  ('gmx-us', '2026-11-26', 'Thanksgiving Day', 'closed', null, null, ''),
  ('gmx-us', '2026-11-27', 'Black Friday', 'closed', null, null, ''),
  ('gmx-us', '2026-11-28', 'Black Friday Saturday', 'closed', null, null, ''),
  ('gmx-us', '2026-12-24', 'Christmas Eve', 'closed', null, null, 'GMX office closed all day'),
  ('gmx-us', '2026-12-25', 'Christmas Day', 'closed', null, null, ''),
  ('gmx-us', '2026-12-31', 'New Year''s Eve', 'closed', null, null, 'GMX office closed all day'),
  ('lumberplus-us', '2026-01-01', 'New Year''s Day', 'closed', null, null, ''),
  ('lumberplus-us', '2026-05-25', 'Memorial Day', 'closed', null, null, ''),
  ('lumberplus-us', '2026-07-03', 'Independence Day (observed)', 'closed', null, null, 'Saturday holiday observed on Friday'),
  ('lumberplus-us', '2026-09-07', 'Labor Day', 'closed', null, null, ''),
  ('lumberplus-us', '2026-11-26', 'Thanksgiving Day', 'closed', null, null, ''),
  ('lumberplus-us', '2026-11-27', 'Black Friday', 'closed', null, null, ''),
  ('lumberplus-us', '2026-11-28', 'Black Friday Saturday', 'closed', null, null, ''),
  ('lumberplus-us', '2026-12-24', 'Christmas Eve', 'reduced', '08:00', '12:00', 'Half day'),
  ('lumberplus-us', '2026-12-25', 'Christmas Day', 'closed', null, null, ''),
  ('lumberplus-us', '2026-12-31', 'New Year''s Eve', 'reduced', '08:00', '12:00', 'Half day')
on conflict (calendar, day) do nothing;

commit;

-- Time off with manager approval, and the HR & Pay links (Rippling).
--   * absences.status: 'pending' → 'approved' | 'declined', or 'cancelled' by the person.
--     Rows that exist today stay 'approved'. Kinds listed in app_settings 'time_off'
--     (default: vacation) need approval; the rest (sick, travel, ooo, holiday) are notes
--     and are approved on entry.
--   * The approver is the person's manager in the org chart (whoever holds the position
--     their position reports to), or HR. Nobody approves their own time off, HR included.
--   * Decisions only through decide_absence(); a trigger stops anyone else from setting
--     the status. Pending and declined time off is visible to the person, their managers
--     and HR only; "Who's out" shows approved time off.
--   * source / external_id: room for time off synced from Rippling later.
--   * app_settings 'hr_pay': the HR & Pay page's links into Rippling, edited by HR.

begin;

alter table public.absences
  add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  add column if not exists decided_by uuid references public.people (id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text not null default '',
  add column if not exists source text not null default 'intranet' check (source in ('intranet', 'rippling')),
  add column if not exists external_id text unique;
create index if not exists absences_status_idx on public.absences (status) where status = 'pending';

-- ── Who approves ────────────────────────────────────────────────────────────
-- People holding the position(s) that this person's positions report to.
create or replace function public.managers_of(p uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct boss.person_id
    from public.positions mine
    join public.positions boss on boss.id = mine.reports_to
   where mine.person_id = p and boss.person_id <> p
$$;

-- Kinds of time off that need approval (app_settings 'time_off' → approval_kinds).
create or replace function public.time_off_approval_kinds() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(value -> 'approval_kinds')) from public.app_settings where key = 'time_off'),
    array['vacation']::text[]
  )
$$;

create or replace function public.can_decide_absence(person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.my_person_id() is not null
    and person is distinct from public.my_person_id()
    and (public.is_hr_editor() or public.my_person_id() in (select public.managers_of(person))),
    false)
$$;

-- ── Guard: only decide_absence() sets approved / declined ───────────────────
create or replace function public.absences_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  needs boolean := new.kind = any(public.time_off_approval_kinds());
  hr_for_other boolean := public.is_hr_editor() and new.person_id is distinct from public.my_person_id();
begin
  -- The service role (Rippling sync) and decide_absence() pass through.
  if auth.uid() is null or current_setting('app.absence_decision', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.source = 'rippling' then
    raise exception 'This time off comes from Rippling; change it there.';
  end if;
  new.source := 'intranet';
  new.external_id := null;

  if tg_op = 'INSERT' then
    if hr_for_other then
      -- HR recording someone's time off: approved unless HR says otherwise.
      if new.status in ('approved', 'declined') then
        new.decided_by := public.my_person_id();
        new.decided_at := now();
      end if;
      return new;
    end if;
    new.status := case when needs then 'pending' else 'approved' end;
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := '';
    return new;
  end if;

  -- UPDATE by the person (or HR editing someone else's time off).
  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      return new;
    end if;
    if not hr_for_other then
      raise exception 'Only their manager or HR can approve or decline time off.';
    end if;
    new.decided_by := public.my_person_id();
    new.decided_at := now();
    return new;
  end if;
  new.decided_by := old.decided_by;
  new.decided_at := old.decided_at;
  new.decision_note := old.decision_note;
  -- Changing the dates or the kind of approved / declined time off sends it back for approval.
  if not hr_for_other and needs and old.status in ('approved', 'declined')
     and (new.starts_on, new.ends_on, new.kind) is distinct from (old.starts_on, old.ends_on, old.kind) then
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := '';
  end if;
  return new;
end;
$$;
drop trigger if exists absences_guard on public.absences;
create trigger absences_guard before insert or update on public.absences
  for each row execute function public.absences_guard();

-- Approve or decline a pending request: the person's manager or HR, never the person.
create or replace function public.decide_absence(target uuid, approve boolean, note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  a public.absences;
  next_status text := case when approve then 'approved' else 'declined' end;
begin
  select * into a from public.absences where id = target for update;
  if not found then raise exception 'Time off not found.'; end if;
  if a.status <> 'pending' then raise exception 'This request was already decided.'; end if;
  if not public.can_decide_absence(a.person_id) then
    raise exception 'Only their manager or HR can decide this request, and not for their own time off.';
  end if;
  perform set_config('app.absence_decision', 'on', true);
  update public.absences
     set status = next_status, decided_by = public.my_person_id(), decided_at = now(),
         decision_note = coalesce(btrim(note), '')
   where id = target;
  perform set_config('app.absence_decision', 'off', true);
  return next_status;
end;
$$;
revoke execute on function public.decide_absence(uuid, boolean, text) from anon;

-- ── Who sees what ───────────────────────────────────────────────────────────
drop policy if exists "read absences" on public.absences;
create policy "read absences" on public.absences for select to authenticated using (
  status = 'approved'
  or person_id = public.my_person_id()
  or public.can_decide_absence(person_id)
);

-- ── Emails ──────────────────────────────────────────────────────────────────
alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('new_hire', 'offboarding', 'travel_submitted', 'travel_status', 'referral_submitted', 'referral_status',
                  'time_off_request', 'time_off_decision'));

-- ── Settings ────────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('time_off', '{"approval_kinds": ["vacation"]}'::jsonb),
  ('hr_pay', jsonb_build_object('links', jsonb_build_array(
    jsonb_build_object('id', 'paystubs',   'url', 'https://app.rippling.com/'),
    jsonb_build_object('id', 'tax',        'url', 'https://app.rippling.com/'),
    jsonb_build_object('id', 'benefits',   'url', 'https://app.rippling.com/'),
    jsonb_build_object('id', 'timeoff',    'url', 'https://app.rippling.com/'),
    jsonb_build_object('id', 'profile',    'url', 'https://app.rippling.com/'),
    jsonb_build_object('id', 'documents',  'url', 'https://app.rippling.com/')
  ), 'note', ''))
on conflict (key) do nothing;

-- HR keeps the HR & Pay links and the time-off rules up to date (admins already can).
create policy "hr writes hr settings" on public.app_settings for all to authenticated
  using (key in ('hr_pay', 'time_off') and public.is_hr_editor())
  with check (key in ('hr_pay', 'time_off') and public.is_hr_editor());

notify pgrst, 'reload schema';

commit;

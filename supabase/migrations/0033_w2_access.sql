-- W2-only access (HR action plan, 26 Oct 2026).
--   * people.employment_type: w2 | contractor | clt | pj (null = not set yet). With the access
--     check on, only active people who are W2 (US) or CLT / PJ (Brazil team) can sign in;
--     admins always can. Contractors with a company address get "access not enabled yet".
--   * people.legal_entity: payroll entity from Rippling, separate from the brand (company_id),
--     so the Lumber Plus Enterprises transfer doesn't move anyone on the org chart.
--   * people.alt_emails: other company addresses of the same person (e.g. ane@lumberplus.com
--     and ane.rambo@gmxgroup.com). Sign-in and the Rippling match look at them too.
--   * people.holiday_calendar: overrides the calendar picked from the office (someone paid by
--     GMX who follows the Lumber Plus store calendar).
--   * These four are written only by the server (HR's Access page and the Rippling sync, with
--     the service role) — never by the person on their own entry.
--   * app_settings 'access': { "enforce": false } until HR has loaded the W2 list.

begin;

alter table public.people
  add column if not exists employment_type  text check (employment_type in ('w2', 'contractor', 'clt', 'pj')),
  add column if not exists legal_entity     text not null default '' check (length(legal_entity) <= 120),
  add column if not exists alt_emails       text[] not null default '{}' check (cardinality(alt_emails) <= 5),
  add column if not exists holiday_calendar text check (holiday_calendar in ('gmx-us', 'lumberplus-us', 'br', 'curitiba'));

create index if not exists people_email_lower_idx on public.people (lower(email));
create index if not exists people_alt_emails_idx on public.people using gin (alt_emails);

create or replace function public.people_hr_fields_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    if new.alt_emails is distinct from old.alt_emails then
      new.alt_emails := coalesce((select array_agg(distinct e) from (
        select lower(btrim(x)) as e from unnest(new.alt_emails) x
      ) s where e <> '' and e is distinct from lower(new.email)), '{}');
    end if;
    return new;
  end if;
  if (new.employment_type, new.legal_entity, new.alt_emails, new.holiday_calendar)
     is distinct from (old.employment_type, old.legal_entity, old.alt_emails, old.holiday_calendar) then
    raise exception 'Employment type, legal entity, other emails and holiday calendar are set by HR.';
  end if;
  return new;
end;
$$;
drop trigger if exists people_hr_fields_guard on public.people;
create trigger people_hr_fields_guard before update on public.people
  for each row execute function public.people_hr_fields_guard();

-- New entries made by people themselves (create_my_person) start without an employment type.
create or replace function public.people_hr_fields_insert_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.employment_type := null;
  new.legal_entity := '';
  new.alt_emails := '{}';
  new.holiday_calendar := null;
  return new;
end;
$$;
drop trigger if exists people_hr_fields_insert_guard on public.people;
create trigger people_hr_fields_insert_guard before insert on public.people
  for each row execute function public.people_hr_fields_insert_guard();

-- ── Settings ────────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values ('access', '{"enforce": false}'::jsonb)
on conflict (key) do nothing;

drop policy if exists "hr writes hr settings" on public.app_settings;
create policy "hr writes hr settings" on public.app_settings for all to authenticated
  using (key in ('hr_pay', 'time_off', 'rippling', 'access') and public.is_hr_editor())
  with check (key in ('hr_pay', 'time_off', 'rippling', 'access') and public.is_hr_editor());

notify pgrst, 'reload schema';

commit;

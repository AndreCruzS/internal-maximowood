-- Team (Brazil / US), set by HR (follow-up to 0033, 28 Oct 2026).
--   * people.work_country: 'BR' | 'US' (null = not set). The W2-only rule is a US rule: with the
--     access check on, everyone on the Brazil team can sign in whatever their contract.
--   * The Brazil team starts on the Brazil holiday calendar and can open every calendar; the US
--     team only sees its own.
--   * Office and country of residence are edited by people themselves, so they can't decide
--     access: this field is written only by the server (HR's Access page), like the 0033 fields.

begin;

alter table public.people
  add column if not exists work_country text check (work_country in ('BR', 'US'));

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
  if (new.employment_type, new.legal_entity, new.alt_emails, new.holiday_calendar, new.work_country)
     is distinct from (old.employment_type, old.legal_entity, old.alt_emails, old.holiday_calendar, old.work_country) then
    raise exception 'Employment type, legal entity, other emails, holiday calendar and team are set by HR.';
  end if;
  return new;
end;
$$;

create or replace function public.people_hr_fields_insert_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.employment_type := null;
  new.legal_entity := '';
  new.alt_emails := '{}';
  new.holiday_calendar := null;
  new.work_country := null;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;

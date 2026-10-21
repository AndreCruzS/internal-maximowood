-- Rippling (US HR) → intranet sync.
--   * people.rippling_id links an org-chart entry to its Rippling worker (set only by the
--     server sync, never by people); rippling_synced_at is the last time the sync touched it.
--   * Once Rippling is switched on (app_settings 'rippling' → enabled), the fields Rippling owns
--     can't be edited in the intranet for linked people: start date, office, company on
--     people; title, department and manager on their positions. The sync (service role)
--     is the only writer. Name, photo, phone and the rest of the profile stay editable.
--   * rippling_sync_runs: one row per sync or preview, with counts and errors (HR and admins read it).
--   * app_settings 'rippling': enabled flag + how Rippling departments / entities / work
--     locations map to intranet departments / companies / offices. HR and admins edit it.
--   * Time off from Rippling lands in absences with source = 'rippling' (columns from 0024).

begin;

alter table public.people
  add column if not exists rippling_id text unique,
  add column if not exists rippling_synced_at timestamptz;

-- ── Sync log ────────────────────────────────────────────────────────────────
create table if not exists public.rippling_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  dry_run     boolean not null default false,
  sample      boolean not null default false,
  trigger     text not null default 'manual' check (trigger in ('manual', 'cron')),
  counts      jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  errors      jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  started_by  uuid references auth.users (id) on delete set null
);
create index if not exists rippling_sync_runs_started_idx on public.rippling_sync_runs (started_at desc);
alter table public.rippling_sync_runs enable row level security;
grant select on public.rippling_sync_runs to authenticated;
drop policy if exists "hr reads rippling runs" on public.rippling_sync_runs;
create policy "hr reads rippling runs" on public.rippling_sync_runs for select to authenticated
  using (public.is_hr_editor());

-- ── Settings ────────────────────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('rippling', '{"enabled": false, "departments": {}, "companies": {}, "offices": {}}'::jsonb)
on conflict (key) do nothing;

drop policy if exists "hr writes hr settings" on public.app_settings;
create policy "hr writes hr settings" on public.app_settings for all to authenticated
  using (key in ('hr_pay', 'time_off', 'rippling') and public.is_hr_editor())
  with check (key in ('hr_pay', 'time_off', 'rippling') and public.is_hr_editor());

create or replace function public.rippling_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'enabled')::boolean from public.app_settings where key = 'rippling'), false)
$$;

-- ── Rippling owns some fields of linked people ──────────────────────────────
create or replace function public.rippling_people_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- the sync (service role)
  if tg_op = 'INSERT' then
    new.rippling_id := null;
    new.rippling_synced_at := null;
    return new;
  end if;
  if new.rippling_id is distinct from old.rippling_id or new.rippling_synced_at is distinct from old.rippling_synced_at then
    raise exception 'The Rippling link is set by the Rippling sync only.';
  end if;
  if old.rippling_id is not null and public.rippling_enabled()
     and (new.start_date, new.office, new.company_id) is distinct from (old.start_date, old.office, old.company_id) then
    raise exception 'Start date, office and company come from Rippling for this person; change them in Rippling.';
  end if;
  return new;
end;
$$;
drop trigger if exists rippling_people_guard on public.people;
create trigger rippling_people_guard before insert or update on public.people
  for each row execute function public.rippling_people_guard();

create or replace function public.rippling_positions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or not public.rippling_enabled() then return new; end if;
  if exists (select 1 from public.people where id = old.person_id and rippling_id is not null)
     and (new.person_id, new.title, new.department_id, new.reports_to)
         is distinct from (old.person_id, old.title, old.department_id, old.reports_to) then
    raise exception 'Title, department and manager come from Rippling for this person; change them in Rippling.';
  end if;
  return new;
end;
$$;
drop trigger if exists rippling_positions_guard on public.positions;
create trigger rippling_positions_guard before update on public.positions
  for each row execute function public.rippling_positions_guard();

notify pgrst, 'reload schema';

commit;

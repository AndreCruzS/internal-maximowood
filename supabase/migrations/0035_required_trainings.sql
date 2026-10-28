-- Mandatory US trainings (HR action plan, workstream 6; 28 Oct 2026).
--   * The courses themselves stay in Rippling. The intranet lists them as a required onboarding
--     step for everyone who isn't on the Brazil team, links to Rippling, and records completion.
--   * required_trainings: HR's list (title, what it is, link into Rippling).
--   * training_completions: who finished which one and when. HR ticks it by hand for now; the
--     Rippling sync writes 'rippling' rows once Rippling's completion data is reachable.

begin;

create table if not exists public.required_trainings (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  link        text check (link is null or link ~* '^https://'),
  -- Who must take it: the US team (everyone not on the Brazil team), Brazil, or everyone.
  applies_to  text not null default 'US' check (applies_to in ('US', 'BR', 'all')),
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.training_completions (
  person_id    uuid not null references public.people (id) on delete cascade,
  training_id  uuid not null references public.required_trainings (id) on delete cascade,
  completed_on date not null default current_date,
  source       text not null default 'hr' check (source in ('hr', 'rippling')),
  recorded_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  primary key (person_id, training_id)
);

alter table public.required_trainings   enable row level security;
alter table public.training_completions enable row level security;
grant select, insert, update, delete on public.required_trainings, public.training_completions to authenticated;

drop policy if exists "read required trainings" on public.required_trainings;
create policy "read required trainings" on public.required_trainings for select to authenticated using (true);
drop policy if exists "hr manages required trainings" on public.required_trainings;
create policy "hr manages required trainings" on public.required_trainings for all to authenticated
  using (public.is_hr_editor()) with check (public.is_hr_editor());

-- Seen by the person, HR, and the leader who hired them or manages them.
drop policy if exists "read training completions" on public.training_completions;
create policy "read training completions" on public.training_completions for select to authenticated using (
  person_id = public.my_person_id() or public.is_hr_editor()
  or exists (select 1 from public.new_hires h where h.person_id = training_completions.person_id
             and (h.created_by = auth.uid() or h.reports_to = public.my_person_id()))
);
drop policy if exists "hr records training completions" on public.training_completions;
create policy "hr records training completions" on public.training_completions for all to authenticated
  using (public.is_hr_editor()) with check (public.is_hr_editor());

insert into public.required_trainings (title, description, applies_to, sort)
select * from (values
  ('Harassment prevention', 'Mandatory in the US. Take it in Rippling (Learning).', 'US', 1),
  ('Ethics and code of conduct', 'Mandatory in the US. Take it in Rippling (Learning).', 'US', 2)
) v(title, description, applies_to, sort)
where not exists (select 1 from public.required_trainings);

notify pgrst, 'reload schema';

commit;

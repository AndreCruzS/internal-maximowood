-- Welcome questionnaire on first sign-in (intranet).
-- New person fields, who-is-in-my-team answers, and "onboarded" on the profile.
-- Nothing on the calculator's tables or on auth.users changes.

begin;

alter table public.people
  add column if not exists first_name  text not null default '',
  add column if not exists last_name   text not null default '',
  add column if not exists nickname    text not null default '',
  add column if not exists nationality text not null default '',
  -- Group companies the person mainly works for (companies.id).
  add column if not exists companies   text[] not null default '{}',
  -- When only the year is known; start_date wins when both are set.
  add column if not exists start_year  smallint check (start_year between 1980 and 2100);

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Answers to "who is in your team" (kept for admins; the org chart uses them below).
create table public.team_relations (
  person_id       uuid not null references public.people (id) on delete cascade,
  other_person_id uuid not null references public.people (id) on delete cascade,
  relation        text not null check (relation in ('superior', 'peer', 'report')),
  created_at      timestamptz not null default now(),
  primary key (person_id, other_person_id),
  check (person_id <> other_person_id)
);
alter table public.team_relations enable row level security;
grant select on public.team_relations to authenticated;
create policy "read team relations" on public.team_relations for select to authenticated using (true);

-- The person's first position (their main one in the org chart).
create function public.primary_position(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.positions where person_id = p order by sort, id limit 1
$$;

/**
 * Save the signed-in person's team answers and place them in the org chart:
 *   superior → my main position reports to theirs;
 *   report   → their main position reports to mine, if they have no manager yet;
 *   peer     → I report to the same manager as them, if I have none yet.
 * `answers` = [{ "person": uuid, "relation": "superior" | "peer" | "report" }]
 */
create function public.save_my_team(answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public.my_person_id();
  mine uuid;
  a jsonb;
  other uuid;
  rel text;
  theirs uuid;
begin
  if me is null then raise exception 'Link yourself to the org chart first'; end if;
  mine := public.primary_position(me);
  delete from public.team_relations where person_id = me;
  for a in select * from jsonb_array_elements(coalesce(answers, '[]'::jsonb)) loop
    other := (a ->> 'person')::uuid;
    rel := a ->> 'relation';
    continue when other is null or other = me or rel not in ('superior', 'peer', 'report');
    insert into public.team_relations (person_id, other_person_id, relation) values (me, other, rel)
      on conflict (person_id, other_person_id) do update set relation = excluded.relation;
    theirs := public.primary_position(other);
    continue when mine is null or theirs is null;
    if rel = 'superior' then
      update public.positions set reports_to = theirs where id = mine;
    elsif rel = 'report' then
      update public.positions set reports_to = mine where id = theirs and reports_to is null;
    elsif rel = 'peer' then
      update public.positions set reports_to = (select reports_to from public.positions where id = theirs)
       where id = mine and reports_to is null;
    end if;
  end loop;
end;
$$;

create function public.complete_my_onboarding() returns void
language sql security definer set search_path = public as $$
  update public.profiles set onboarded_at = now() where user_id = auth.uid();
$$;

revoke execute on function public.save_my_team(jsonb), public.complete_my_onboarding(), public.primary_position(uuid) from anon;

commit;

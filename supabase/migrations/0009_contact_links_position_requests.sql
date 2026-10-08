-- People: contact through Gmail / Slack / RingCentral only, and position changes by request.
--   * people.phone now means the RingCentral number; people.slack_id is the Slack member ID.
--   * People can no longer edit their own positions (or their team) once the welcome
--     questionnaire is done; they file a request and an admin applies it.

begin;

alter table public.people
  add column if not exists slack_id text check (slack_id is null or slack_id ~ '^[UW][A-Z0-9]{6,}$');

-- Own positions are editable only during the welcome questionnaire.
create or replace function public.my_onboarded() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select onboarded_at is not null from public.profiles where user_id = auth.uid()), false)
$$;

drop policy if exists "manage own positions" on public.positions;
create policy "manage own positions while onboarding" on public.positions for all to authenticated
  using (person_id = public.my_person_id() and not public.my_onboarded())
  with check (person_id = public.my_person_id() and not public.my_onboarded());

-- Team answers also only during the questionnaire (afterwards: request a change).
create or replace function public.save_my_team(answers jsonb) returns void
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
  if public.my_onboarded() and not public.is_admin() then raise exception 'Ask an admin to change your team'; end if;
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

-- "Request to change my position": the person describes it; an admin approves or declines.
create table public.position_requests (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people (id) on delete cascade,
  title         text not null default '',
  department_id text references public.departments (id),
  reports_to    uuid references public.people (id) on delete set null,
  note          text not null default '',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references auth.users (id) on delete set null
);
create index position_requests_status_idx on public.position_requests (status, created_at desc);

alter table public.position_requests enable row level security;
grant select, insert, update, delete on public.position_requests to authenticated;
create policy "see own or all as admin" on public.position_requests for select to authenticated
  using (person_id = public.my_person_id() or public.is_admin());
create policy "request own change" on public.position_requests for insert to authenticated
  with check (person_id = public.my_person_id() and status = 'pending');
create policy "admins decide" on public.position_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "cancel own pending" on public.position_requests for delete to authenticated
  using (person_id = public.my_person_id() and status = 'pending');

commit;

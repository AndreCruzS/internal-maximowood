-- SOPs, round 1 (inspired by Whale):
--  • Templates: structured sections (scope, prerequisites, escalation, control rules,
--    completion criteria…), a roles table linked to real people, definitions,
--    resources and a video. Stored next to the existing body/steps.
--  • Assign to read: send a playbook to people with a due date and a note. It's done
--    when they confirm they've read it (playbook_acks), which closes the assignment.
--  • Versions: every content change keeps the previous version (who/when) so it can
--    be viewed and restored. A significant change can ask everyone to confirm again
--    (ack_version): older confirmations then no longer count.

begin;

-- ── Structured content ──────────────────────────────────────────────────────
alter table public.playbooks
  add column if not exists template    text check (template is null or template in ('sop_detailed', 'sop_simple', 'policy', 'video')),
  add column if not exists sections    jsonb not null default '{}'::jsonb,  -- { scope: "…", prerequisites: "…", … }
  add column if not exists roles       jsonb not null default '[]'::jsonb,  -- [{ role, people: [person ids], responsibility }]
  add column if not exists definitions jsonb not null default '[]'::jsonb,  -- [{ term, definition }]
  add column if not exists resources   jsonb not null default '[]'::jsonb,  -- [{ label, url }]
  add column if not exists video_url   text check (video_url is null or video_url ~* '^https?://'),
  add column if not exists version     integer not null default 1,
  add column if not exists ack_version integer not null default 1;

alter table public.playbooks
  add constraint playbooks_sections_object check (jsonb_typeof(sections) = 'object'),
  add constraint playbooks_roles_array check (jsonb_typeof(roles) = 'array'),
  add constraint playbooks_definitions_array check (jsonb_typeof(definitions) = 'array'),
  add constraint playbooks_resources_array check (jsonb_typeof(resources) = 'array');

-- Which version each confirmation was for. Existing confirmations count for version 1.
alter table public.playbook_acks add column if not exists version integer not null default 1;
grant update on public.playbook_acks to authenticated;
drop policy if exists "re-ack myself" on public.playbook_acks;
create policy "re-ack myself" on public.playbook_acks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Version history ─────────────────────────────────────────────────────────
create table public.playbook_versions (
  id          uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  version     integer not null,
  snapshot    jsonb not null,               -- the content as it was in that version
  edited_by   uuid references auth.users (id) on delete set null,  -- who wrote that version
  edited_at   timestamptz not null,         -- when it was written
  unique (playbook_id, version)
);
create index playbook_versions_idx on public.playbook_versions (playbook_id, version desc);
alter table public.playbook_versions enable row level security;
grant select on public.playbook_versions to authenticated;
-- Only the team (and admins) see the history; rows are written by the trigger alone.
create policy "team reads versions" on public.playbook_versions for select to authenticated
  using (exists (select 1 from public.playbooks p where p.id = playbook_id and (public.in_department(p.department_id) or public.is_admin())));

create or replace function public.playbook_snapshot(p public.playbooks) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'kind', p.kind, 'title', p.title, 'summary', p.summary, 'category', p.category, 'company_id', p.company_id,
    'body', p.body, 'steps', p.steps, 'link_url', p.link_url, 'template', p.template, 'sections', p.sections,
    'roles', p.roles, 'definitions', p.definitions, 'resources', p.resources, 'video_url', p.video_url,
    'owner_person_id', p.owner_person_id, 'ack_required', p.ack_required, 'language', p.language
  )
$$;

-- Before a content change: keep the old version and bump the number.
create or replace function public.playbook_keep_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.playbook_snapshot(new) is distinct from public.playbook_snapshot(old) then
    insert into public.playbook_versions (playbook_id, version, snapshot, edited_by, edited_at)
    values (old.id, old.version, public.playbook_snapshot(old), coalesce(old.updated_by, old.created_by), old.updated_at)
    on conflict (playbook_id, version) do nothing;
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  -- "Ask everyone to confirm again" can only point at the current version (or earlier).
  new.ack_version := greatest(1, least(new.ack_version, new.version));
  return new;
end $$;
drop trigger if exists playbooks_keep_version on public.playbooks;
create trigger playbooks_keep_version before update on public.playbooks
  for each row execute function public.playbook_keep_version();

-- ── Assignments ─────────────────────────────────────────────────────────────
-- Who can send a playbook to people: its department's team, leaders, HR and admins.
create or replace function public.can_assign_playbook(pb uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_admin() or public.my_role() = 'leader' or public.in_department('hr')
    or exists (select 1 from public.playbooks p where p.id = pb and public.in_department(p.department_id)),
    false)
$$;

create table public.playbook_assignments (
  id                   uuid primary key default gen_random_uuid(),
  playbook_id          uuid not null references public.playbooks (id) on delete cascade,
  person_id            uuid not null references public.people (id) on delete cascade,  -- who should read it
  assigned_by          uuid not null default auth.uid() references auth.users (id) on delete set null,
  assigned_by_person_id uuid references public.people (id) on delete set null,
  due_on               date,
  note                 text not null default '' check (length(note) <= 500),
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);
-- One open assignment per person and playbook (it can be sent again once done).
create unique index playbook_assignments_open_idx on public.playbook_assignments (playbook_id, person_id) where completed_at is null;
create index playbook_assignments_person_idx on public.playbook_assignments (person_id, completed_at);

alter table public.playbook_assignments enable row level security;
grant select, insert, update, delete on public.playbook_assignments to authenticated;
create policy "see assignments" on public.playbook_assignments for select to authenticated
  using (person_id = public.my_person_id() or assigned_by = auth.uid() or public.can_assign_playbook(playbook_id));
create policy "assign" on public.playbook_assignments for insert to authenticated
  with check (public.can_assign_playbook(playbook_id) and assigned_by = auth.uid() and completed_at is null);
create policy "change assignment" on public.playbook_assignments for update to authenticated
  using (assigned_by = auth.uid() or public.can_assign_playbook(playbook_id))
  with check (assigned_by = auth.uid() or public.can_assign_playbook(playbook_id));
create policy "remove assignment" on public.playbook_assignments for delete to authenticated
  using (assigned_by = auth.uid() or public.can_assign_playbook(playbook_id));

-- Confirming you've read the current version closes your open assignments for it.
create or replace function public.playbook_ack_closes_assignments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.playbook_assignments a
     set completed_at = now()
    from public.people pe, public.playbooks p
   where a.playbook_id = new.playbook_id and a.completed_at is null
     and pe.id = a.person_id and pe.user_id = new.user_id
     and p.id = new.playbook_id and new.version >= p.ack_version;
  return new;
end $$;
drop trigger if exists playbook_acks_close on public.playbook_acks;
create trigger playbook_acks_close after insert or update on public.playbook_acks
  for each row execute function public.playbook_ack_closes_assignments();

-- People assigned to a department-only playbook can still open it.
create or replace function public.assigned_to_me(pb uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.playbook_assignments a where a.playbook_id = pb and a.person_id = public.my_person_id())
$$;
drop policy if exists "read playbooks" on public.playbooks;
create policy "read playbooks" on public.playbooks for select to authenticated
  using (
    public.in_department(department_id) or public.is_admin()
    or (status = 'published' and (visibility = 'everyone' or department_id = any (public.my_departments())))
    or (status = 'published' and public.assigned_to_me(id))
  );

-- The viewer's playbook to-dos for the home page: open assignments, and must-read
-- playbooks they confirmed before a significant change.
create or replace function public.my_playbook_todos()
returns table (playbook_id uuid, title text, kind text, due_on date, note text, since timestamptz, reason text)
language sql stable security definer set search_path = public as $$
  select a.playbook_id, p.title, p.kind, a.due_on, a.note, a.created_at, 'assigned'
    from public.playbook_assignments a join public.playbooks p on p.id = a.playbook_id
   where a.person_id = public.my_person_id() and a.completed_at is null and p.status = 'published'
  union all
  select p.id, p.title, p.kind, null::date, '', k.acked_at, 'reconfirm'
    from public.playbook_acks k join public.playbooks p on p.id = k.playbook_id
   where k.user_id = auth.uid() and p.ack_required and p.status = 'published' and k.version < p.ack_version
     and not exists (select 1 from public.playbook_assignments a
                      where a.playbook_id = p.id and a.person_id = public.my_person_id() and a.completed_at is null)
  order by 4 nulls last, 6
$$;
grant execute on function public.my_playbook_todos() to authenticated;

commit;

-- Department playbooks: SOPs, policies, rules, checklists and guides, written by
-- the department's own team (anyone holding a position in it), plus admins.
-- Organized like Whale: each playbook has a type, an optional brand, a category,
-- an owner, a review date and ordered steps; policies can ask for "I've read it".

begin;

-- Is the signed-in person on this department's team (a position in it, or their profile department)?
create or replace function public.in_department(dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select dept is not null and (
    exists (select 1 from public.positions where person_id = public.my_person_id() and department_id = dept)
    or public.my_department() = dept
  )
$$;

create table public.playbooks (
  id               uuid primary key default gen_random_uuid(),
  department_id    text not null references public.departments (id),
  company_id       text references public.companies (id),          -- brand; null = all brands
  kind             text not null default 'sop' check (kind in ('sop', 'policy', 'rule', 'checklist', 'guide')),
  title            text not null check (length(btrim(title)) > 0),
  summary          text not null default '',
  category         text not null default '',                      -- free "folder" within the department
  body             text not null default '',                      -- intro / policy text
  steps            jsonb not null default '[]'::jsonb,            -- [{ "title": "...", "body": "..." }]
  link_url         text check (link_url is null or link_url ~* '^https?://'),
  owner_person_id  uuid references public.people (id) on delete set null,
  review_by        date,
  status           text not null default 'published' check (status in ('draft', 'published')),
  ack_required     boolean not null default false,
  language         text check (language in ('en', 'es', 'pt')),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  check (jsonb_typeof(steps) = 'array')
);
create index playbooks_department_idx on public.playbooks (department_id, kind, updated_at desc);
create trigger playbooks_updated_at before update on public.playbooks for each row execute function public.set_updated_at();

create table public.playbook_acks (
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  acked_at    timestamptz not null default now(),
  primary key (playbook_id, user_id)
);

alter table public.playbooks     enable row level security;
alter table public.playbook_acks enable row level security;
grant select, insert, update, delete on public.playbooks to authenticated;
grant select, insert, delete on public.playbook_acks to authenticated;

-- Everyone reads published playbooks; drafts only the team (and admins).
create policy "read playbooks" on public.playbooks for select to authenticated
  using (status = 'published' or public.in_department(department_id) or public.is_admin());
create policy "team writes playbooks" on public.playbooks for insert to authenticated
  with check (public.in_department(department_id) or public.is_admin());
create policy "team edits playbooks" on public.playbooks for update to authenticated
  using (public.in_department(department_id) or public.is_admin())
  with check (public.in_department(department_id) or public.is_admin());
create policy "team removes playbooks" on public.playbooks for delete to authenticated
  using (public.in_department(department_id) or public.is_admin());

create policy "read acks" on public.playbook_acks for select to authenticated using (true);
create policy "ack myself" on public.playbook_acks for insert to authenticated with check (user_id = auth.uid());
create policy "unack myself" on public.playbook_acks for delete to authenticated using (user_id = auth.uid());

commit;

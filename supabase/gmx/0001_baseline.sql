-- GMX Group Intranet — baseline schema for the company-owned Supabase project
-- (gmx-intranet, ref yyhstdetuhfhpsakrbyw). Replaces supabase/migrations/,
-- which describes the previous, borrowed project.
--
-- Access model (enforced by RLS below):
--   * everyone signed in reads companies, departments, profiles, and the
--     links/news visible to them;
--   * a department leader manages their own department's links and news;
--   * admins manage everything;
--   * quotes stay private to their owner (admins read them via the service role);
--   * only addresses on allowed_email_domains can have an account at all.

begin;

-- ── Reference data ───────────────────────────────────────────────────────────
create table public.companies (
  id   text primary key,
  name text not null,
  sort int  not null default 0
);

create table public.departments (
  id   text primary key,
  name text not null,
  icon text,
  sort int  not null default 0
);

-- Which email domains may sign up, and the company each one belongs to.
create table public.allowed_email_domains (
  domain     text primary key check (domain = lower(domain)),
  company_id text not null references public.companies (id)
);

insert into public.companies (id, name, sort) values
  ('gmx', 'GMX Group', 0),
  ('maximo', 'Maximo', 1),
  ('lumberplus', 'Lumber Plus', 2),
  ('us4pro', 'US4Pro', 3);

insert into public.departments (id, name, icon, sort) values
  ('commercial', 'Commercial / Sales', 'briefcase', 1),
  ('marketing', 'Marketing', 'megaphone', 2),
  ('operations', 'Operations', 'factory', 3),
  ('logistics', 'Logistics', 'truck', 4),
  ('finance', 'Finance / Accounting', 'landmark', 5),
  ('hr', 'HR', 'users', 6),
  ('it', 'IT', 'monitor', 7);

insert into public.allowed_email_domains (domain, company_id) values
  ('gmxgroup.com', 'gmx'), ('gmxgroup.us', 'gmx'),
  ('maximowood.com', 'maximo'), ('maximowood.us', 'maximo'),
  ('lumberplus.com', 'lumberplus'), ('lumberplus.us', 'lumberplus'),
  ('us4pro.com', 'us4pro'), ('us4pro.us', 'us4pro');

-- ── People ───────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  job_title     text not null default '',
  phone         text not null default '',
  avatar_url    text,
  company_id    text references public.companies (id),
  department_id text references public.departments (id),
  manager_id    uuid references public.profiles (user_id) on delete set null,
  role          text not null default 'member' check (role in ('member', 'leader', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_department_idx on public.profiles (department_id);

-- ── Content ──────────────────────────────────────────────────────────────────
-- A link to anything: a web app, a Drive doc/sheet/folder, a PDF, a form…
-- company_id / department_id null = group-wide / all departments.
create table public.links (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  url           text not null check (url ~* '^https?://'),
  description   text not null default '',
  kind          text not null default 'web_app'
                check (kind in ('web_app', 'doc', 'sheet', 'slides', 'pdf', 'folder', 'form', 'video', 'other')),
  language      text,
  company_id    text references public.companies (id),
  department_id text references public.departments (id),
  visibility    text not null default 'everyone' check (visibility in ('everyone', 'department')),
  pinned        boolean not null default false,
  sort          int not null default 0,
  owner_id      uuid references public.profiles (user_id) on delete set null,
  reviewed_at   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (visibility = 'everyone' or department_id is not null)
);

create index links_department_idx on public.links (department_id);

create table public.news (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  body          text not null default '',
  image_url     text,
  link_url      text,
  company_id    text references public.companies (id),
  department_id text references public.departments (id),
  featured      boolean not null default false,
  published_at  timestamptz not null default now(),
  author_id     uuid references public.profiles (user_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index news_published_idx on public.news (published_at desc);

-- ── Saved quotes (same shape as the previous project's 0004 + 0005) ──────────
create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_name    text not null check (length(btrim(project_name)) > 0),
  calculator      text not null default 'retail' check (calculator in ('retail', 'b2b')),
  company         text,
  contact         text,
  address         text,
  prepared_by     text,
  notes           text,
  tax             numeric(12, 2),
  shipping        numeric(12, 2),
  lead_time_weeks smallint check (lead_time_weeks between 1 and 52),
  items           jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  total           numeric(14, 2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index quotes_user_project_name_key on public.quotes (user_id, lower(btrim(project_name)));
create index quotes_user_updated_at_idx on public.quotes (user_id, updated_at desc);

-- ── Nightly inventory sync target (src/server/inventorySync.ts; service role only) ──
create table public.inventory (
  id             bigint generated by default as identity primary key,
  "branchName"   varchar(128) not null,
  species        varchar(128) not null,
  "nominalSize"  varchar(32),
  profile        varchar(256),
  "stockLf"      integer not null default 0,
  "lastSyncedAt" timestamptz not null default now(),
  "lengthFt"     integer,
  pieces         integer
);

create table public."inventorySyncLog" (
  id             bigint generated by default as identity primary key,
  "syncedAt"     timestamptz not null default now(),
  "rowsUpserted" integer not null default 0,
  status         varchar(32) not null default 'success',
  "errorMessage" text
);

-- ── updated_at ───────────────────────────────────────────────────────────────
create function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger links_updated_at    before update on public.links    for each row execute function public.set_updated_at();
create trigger news_updated_at     before update on public.news     for each row execute function public.set_updated_at();
create trigger quotes_updated_at   before update on public.quotes   for each row execute function public.set_updated_at();

-- ── Accounts: company domains only; every account gets a profile ────────────
create function public.check_email_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.allowed_email_domains d
    where d.domain = lower(split_part(new.email, '@', 2))
  ) then
    raise exception 'Only GMX Group company email addresses can have an account (%).', new.email
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_email_domain before insert or update of email on auth.users
  for each row execute function public.check_email_domain();

create function public.create_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, full_name, company_id)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''),
    (select d.company_id from public.allowed_email_domains d where d.domain = lower(split_part(new.email, '@', 2)))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger create_profile after insert on auth.users
  for each row execute function public.create_profile();

-- ── Permission helpers (security definer: read the caller's own profile) ─────
create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where user_id = auth.uid()), 'member')
$$;

create function public.my_department() returns text
language sql stable security definer set search_path = public as $$
  select department_id from public.profiles where user_id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin' or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- Admins manage everything; a leader manages their own department's content.
create function public.can_manage(dept text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.my_role() = 'leader' and dept is not null and dept = public.my_department())
$$;

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.companies             enable row level security;
alter table public.departments           enable row level security;
alter table public.allowed_email_domains enable row level security;
alter table public.profiles              enable row level security;
alter table public.links                 enable row level security;
alter table public.news                  enable row level security;
alter table public.quotes                enable row level security;
alter table public.inventory             enable row level security;
alter table public."inventorySyncLog"    enable row level security;

-- Deny by default: nothing for anon, then grant signed-in users what they need.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.companies, public.departments, public.profiles, public.links, public.news to authenticated;
grant insert, update, delete on public.links, public.news to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
-- Members edit their own contact details; role/department/company are set by admins.
grant update (full_name, job_title, phone, avatar_url) on public.profiles to authenticated;

create policy "read companies"   on public.companies   for select to authenticated using (true);
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "read profiles"    on public.profiles    for select to authenticated using (true);
create policy "edit own profile" on public.profiles    for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read visible links" on public.links for select to authenticated
  using (visibility = 'everyone' or department_id = public.my_department() or public.can_manage(department_id));
create policy "add links"    on public.links for insert to authenticated with check (public.is_admin() or public.can_manage(department_id));
create policy "edit links"   on public.links for update to authenticated
  using (public.can_manage(department_id)) with check (public.is_admin() or public.can_manage(department_id));
create policy "remove links" on public.links for delete to authenticated using (public.can_manage(department_id));

create policy "read news"   on public.news for select to authenticated using (true);
create policy "add news"    on public.news for insert to authenticated with check (public.is_admin() or public.can_manage(department_id));
create policy "edit news"   on public.news for update to authenticated
  using (public.can_manage(department_id)) with check (public.is_admin() or public.can_manage(department_id));
create policy "remove news" on public.news for delete to authenticated using (public.can_manage(department_id));

create policy "own quotes" on public.quotes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- inventory, inventorySyncLog, allowed_email_domains: no policies — service role only.

commit;

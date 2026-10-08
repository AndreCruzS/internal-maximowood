-- GMX Group Intranet on this (shared) project — combined from supabase/gmx/0001–0007.
-- Leaves the existing quotes, inventory and auth.users untouched.
--
-- Access model (enforced by RLS below):
--   * everyone signed in reads companies, departments, profiles, and the
--     links/news visible to them;
--   * a department leader manages their own department's links and news;
--   * admins manage everything;
--   * company email domains are enforced by the app's Admin screen.

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
  ('us4pro', 'US4', 3),
  ('builderexpress', 'Builder Express', 4);

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

-- ── Profiles are created by the app on first visit (no trigger on auth.users:
--    this project is shared, so the login system itself is left untouched).
create function public.ensure_my_profile() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then return; end if;
  insert into public.profiles (user_id, email, full_name, company_id)
  select u.id, lower(u.email),
         coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', ''),
         (select d.company_id from public.allowed_email_domains d where d.domain = lower(split_part(u.email, '@', 2)))
    from auth.users u where u.id = me
  on conflict (user_id) do nothing;
end;
$$;
revoke execute on function public.ensure_my_profile() from anon;

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

-- Deny by default: nothing for anon, then grant signed-in users what they need.
revoke all on public.companies, public.departments, public.allowed_email_domains, public.profiles, public.links, public.news from anon, authenticated;

grant select on public.companies, public.departments, public.profiles, public.links, public.news to authenticated;
grant insert, update, delete on public.links, public.news to authenticated;
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

-- ════ People & org chart (gmx/0003) ════
-- People and org chart. Everyone in the company is a person (with or without an
-- intranet login); a person can hold more than one position (e.g. a manager of
-- two teams). The org chart is the tree of positions via reports_to.


create table public.people (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(btrim(full_name)) > 0),
  email       text,
  phone       text,
  location    text,
  photo_url   text,
  company_id  text references public.companies (id),
  user_id     uuid unique references auth.users (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.positions (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people (id) on delete cascade,
  title         text not null,
  department_id text references public.departments (id),
  team          text,
  reports_to    uuid references public.positions (id) on delete set null,
  sort          int not null default 0,
  check (reports_to is distinct from id)
);

create index positions_reports_to_idx on public.positions (reports_to);
create index positions_department_idx on public.positions (department_id);

create trigger people_updated_at before update on public.people for each row execute function public.set_updated_at();

alter table public.people    enable row level security;
alter table public.positions enable row level security;
grant select on public.people, public.positions to authenticated;
grant insert, update, delete on public.people, public.positions to authenticated;

create policy "read people"    on public.people    for select to authenticated using (true);
create policy "read positions" on public.positions for select to authenticated using (true);
create policy "admins manage people"    on public.people    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage positions" on public.positions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Self-service: people keep their own entry and positions up to date.
create function public.my_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.people where user_id = auth.uid()
$$;

create policy "edit own person" on public.people for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "manage own positions" on public.positions for all to authenticated
  using (person_id = public.my_person_id()) with check (person_id = public.my_person_id());

-- First sign-in: claim an existing (seeded) entry, or create a new one.
create function public.claim_person(target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if public.my_person_id() is not null then raise exception 'You already have a people entry'; end if;
  update public.people
     set user_id = me,
         email = coalesce(email, (select email from auth.users where id = me))
   where id = target and user_id is null;
  if not found then raise exception 'That entry is already linked to someone'; end if;
  return target;
end;
$$;

create function public.create_my_person(name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if public.my_person_id() is not null then return public.my_person_id(); end if;
  insert into public.people (full_name, email, user_id, company_id)
  select coalesce(nullif(btrim(name), ''), split_part(u.email, '@', 1)), u.email, me,
         (select d.company_id from public.allowed_email_domains d where d.domain = lower(split_part(u.email, '@', 2)))
    from auth.users u where u.id = me
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.claim_person(uuid), public.create_my_person(text) from anon;

-- Seed: GMX org chart slides (Liderança, Operações, Financeiro, Marketing, Vendas), 2026-10.
-- Emails, phones, companies and the directors' managers still to be filled in.
insert into public.people (id, full_name) values
  ('b1fac72e-031a-59c9-8b0a-5f41152b60dc', 'Giovani Miguel'),
  ('7a52a060-8360-5ba9-b809-a31602719ff1', 'Guto Fugiwara'),
  ('f8e6b3d4-5db4-5da1-b9d4-a5c00a68ef3e', 'João Costa'),
  ('62be9bfe-7ac5-59b9-a207-df7a72cbfdcd', 'Diogo Saling'),
  ('c85184e9-5a68-5ff8-b8e1-b1e51dca6a4c', 'Rafael Stival'),
  ('0cc7fbcf-3e72-5475-a5ff-e47dda8ee982', 'Vanessa Batista'),
  ('1aa14d97-88c4-55ea-907e-f279a1a65637', 'Lucimeri Bloch'),
  ('f16d38e4-409f-5b16-8747-fe90910507bd', 'Elton Strapasson'),
  ('628a80e8-ad98-5d94-9579-3766b7148dbd', 'Allana Berehulka'),
  ('6641453d-f268-5209-8323-ee54a4b51874', 'Asser Ulrich'),
  ('a91d55be-f59c-5450-a03f-dd7ed0e7368d', 'Henrique Mermer'),
  ('9e8606a6-302a-55da-b26b-ddb4b0286904', 'Adrian Cardoso'),
  ('54f89a94-d61b-5fa4-a7a8-c743bcdc3dff', 'Alaor José'),
  ('876bc639-b521-5b9f-bbe6-b2b1536656d0', 'Belisa Mermer'),
  ('a117be3d-1bdb-570d-ae19-c7f6f7e4c232', 'Daniele Silva'),
  ('394226a5-0a33-569f-8f0b-bae0b200735b', 'Paulo Renelli'),
  ('1ad8bc0d-53e8-5d2d-8625-a4701f32ae06', 'Vinicios Peres'),
  ('7a0b1082-30d4-5c22-abec-97e73231bbda', 'Silmara Godoy'),
  ('dc5efe29-2b0a-5946-8a74-f4d82d6b9b5a', 'Renan Rocha'),
  ('a9af8ff8-4160-5a52-af93-51ecddfbaedc', 'Marcelo Guimarães'),
  ('da6704ac-6955-51e3-81ed-45f56d5c66d4', 'Anna Luiza Miguel'),
  ('f88c69be-4286-59fa-80e5-13061debd91b', 'Gabriela Traya'),
  ('f7e811ea-bff8-565b-84f1-d6e036ebbb0f', 'Victor Gonzalez'),
  ('ed3d6c8b-7906-5601-a9ad-85c045f7ca60', 'Fernando Louzada'),
  ('ed447b04-07d6-549f-aa12-ffce96f6600a', 'Marcello Peruzzo'),
  ('f136a3c6-a560-5dee-8f14-b651fa991c44', 'Raphael Benedetti'),
  ('58ac57b1-061f-5439-8d1d-78e10ec37d8b', 'Felipe Lübke'),
  ('862ca28c-0c67-5da3-ad24-cfdf825233c8', 'Helen Tiene'),
  ('d9a79ecb-199b-5788-8a3c-812ca55c4945', 'Matheus Selleti'),
  ('419c0471-b0fd-5441-b1ac-09220db3c573', 'Nathália Chaves'),
  ('b00c626e-b4cd-5afa-a977-a7eb41f66407', 'Leonardo Miguel');

insert into public.positions (id, person_id, title, department_id, team, reports_to, sort) values
  ('4fa7f02f-ccc0-5628-98d8-b34ef5f15642', 'b1fac72e-031a-59c9-8b0a-5f41152b60dc', 'CEO & Sócio', null, 'Liderança', null, 0),
  ('b4a07afd-2442-5d42-9c5a-675a865d689e', '7a52a060-8360-5ba9-b809-a31602719ff1', 'COO & Sócio', null, 'Liderança', null, 1),
  ('9c2c9960-9491-5c1f-88b4-4862d3eb0cf9', 'f8e6b3d4-5db4-5da1-b9d4-a5c00a68ef3e', 'CCO & Sócio', null, 'Liderança', null, 2),
  ('490659cb-c847-5f6c-b8b3-9e0fdf5c2f7b', '62be9bfe-7ac5-59b9-a207-df7a72cbfdcd', 'Presidente US4 & Sócio', null, 'Liderança', null, 3),
  ('88770a89-996f-5825-9f85-51d6b87bc82a', 'c85184e9-5a68-5ff8-b8e1-b1e51dca6a4c', 'Diretor de Logística', 'operations', 'Operações', null, 4),
  ('3e1d1223-3c46-5e23-83e5-ec479703251e', '0cc7fbcf-3e72-5475-a5ff-e47dda8ee982', 'Coordenadora de Exportação', 'logistics', 'Comex', '88770a89-996f-5825-9f85-51d6b87bc82a', 5),
  ('d6a04a39-d914-5ef4-8f3d-00714a0241e3', '1aa14d97-88c4-55ea-907e-f279a1a65637', 'Assistente de Exportação', 'logistics', 'Comex', '3e1d1223-3c46-5e23-83e5-ec479703251e', 6),
  ('589daca4-921d-5b1d-8582-3e0ceb323872', 'f16d38e4-409f-5b16-8747-fe90910507bd', 'Coordenador de Logística', 'logistics', 'Logística', '88770a89-996f-5825-9f85-51d6b87bc82a', 7),
  ('61600d9f-4ec7-5574-9a0f-3b21f8b676db', '628a80e8-ad98-5d94-9579-3766b7148dbd', 'Analista de Logística JR', 'logistics', 'Logística', '589daca4-921d-5b1d-8582-3e0ceb323872', 8),
  ('5c6dfc68-b507-5fb2-b397-864bf31333eb', '6641453d-f268-5209-8323-ee54a4b51874', 'Analista de Logística JR', 'logistics', 'Logística', '589daca4-921d-5b1d-8582-3e0ceb323872', 9),
  ('9ac44840-39d8-5075-80f0-9f228db3e7ca', 'a91d55be-f59c-5450-a03f-dd7ed0e7368d', 'Analista de Logística JR', 'logistics', 'Logística', '589daca4-921d-5b1d-8582-3e0ceb323872', 10),
  ('eaab8b7d-f2d7-5f99-8a13-6d7cd9ded739', '9e8606a6-302a-55da-b26b-ddb4b0286904', 'Analista de Logística', 'logistics', 'Logística', '589daca4-921d-5b1d-8582-3e0ceb323872', 11),
  ('683bfc3b-0acd-50e3-b77d-f0d8323d9b76', '54f89a94-d61b-5fa4-a7a8-c743bcdc3dff', 'Recursos Humanos', 'hr', 'Recursos Humanos', '88770a89-996f-5825-9f85-51d6b87bc82a', 12),
  ('55add981-4e27-521f-bd0d-052e0016c5bc', '876bc639-b521-5b9f-bbe6-b2b1536656d0', 'Diretora Comercial', 'operations', 'Compras', '88770a89-996f-5825-9f85-51d6b87bc82a', 13),
  ('eb753be4-5d67-52a9-ba6d-b2a99ea05d9a', 'a117be3d-1bdb-570d-ae19-c7f6f7e4c232', 'Analista Comercial', 'operations', 'Compras', '55add981-4e27-521f-bd0d-052e0016c5bc', 14),
  ('f1751f5b-400d-533f-b78f-a58c0837eed8', '394226a5-0a33-569f-8f0b-bae0b200735b', 'CFO', 'finance', 'Financeiro', null, 15),
  ('b3999800-af31-54e7-b428-afbd2b5ed7df', '1ad8bc0d-53e8-5d2d-8625-a4701f32ae06', 'Diretor Financeiro', 'finance', 'Financeiro', 'f1751f5b-400d-533f-b78f-a58c0837eed8', 16),
  ('74f55df7-40f8-5a34-8432-9b5dff00dbdc', '7a0b1082-30d4-5c22-abec-97e73231bbda', 'Coordenadora Financeira', 'finance', 'Financeiro', 'b3999800-af31-54e7-b428-afbd2b5ed7df', 17),
  ('a1d19d42-d770-56c4-aaad-ad697f5c413c', 'dc5efe29-2b0a-5946-8a74-f4d82d6b9b5a', 'Analista Financeiro', 'finance', 'Financeiro', '74f55df7-40f8-5a34-8432-9b5dff00dbdc', 18),
  ('25a2c322-98d7-5a77-8e4f-4a2d52fa6f27', 'a9af8ff8-4160-5a52-af93-51ecddfbaedc', 'Diretor de Marketing', 'marketing', 'Marketing', null, 19),
  ('5f272f7b-3950-5c08-b278-a1bc69f0ca25', 'da6704ac-6955-51e3-81ed-45f56d5c66d4', 'Gestora de Marca - Maximo', 'marketing', 'Project Management', '25a2c322-98d7-5a77-8e4f-4a2d52fa6f27', 20),
  ('688a9a6e-89d0-5877-bd9e-357a3341bd1c', 'f88c69be-4286-59fa-80e5-13061debd91b', 'Gestora de Projetos JR', 'marketing', 'Project Management', '5f272f7b-3950-5c08-b278-a1bc69f0ca25', 21),
  ('962095d8-1412-519f-a123-9de2e9a0f24f', 'f7e811ea-bff8-565b-84f1-d6e036ebbb0f', 'Gestor de Marca - Lumber Plus', 'marketing', 'Project Management', '25a2c322-98d7-5a77-8e4f-4a2d52fa6f27', 22),
  ('92d2703a-e512-5e89-af00-7f72855d833c', 'ed3d6c8b-7906-5601-a9ad-85c045f7ca60', 'Lead de Design', 'marketing', 'Criação', '25a2c322-98d7-5a77-8e4f-4a2d52fa6f27', 23),
  ('47a6bd9a-84a1-53ff-abd8-e2e56d3ddb79', 'ed447b04-07d6-549f-aa12-ffce96f6600a', 'Estagiário de Design', 'marketing', 'Criação', '92d2703a-e512-5e89-af00-7f72855d833c', 24),
  ('ac86c350-7c62-5336-9952-e1c2c3e8b431', 'f136a3c6-a560-5dee-8f14-b651fa991c44', 'Lead de Growth', 'marketing', 'Performance', '25a2c322-98d7-5a77-8e4f-4a2d52fa6f27', 25),
  ('48c04a10-fbcb-536a-9d73-f35ac1e1e6f6', '58ac57b1-061f-5439-8d1d-78e10ec37d8b', 'Analista de Dados & Growth', 'marketing', 'Performance', 'ac86c350-7c62-5336-9952-e1c2c3e8b431', 26),
  ('6f2b49af-3a2f-50d2-9ba5-45c80e5a3e70', 'da6704ac-6955-51e3-81ed-45f56d5c66d4', 'Gestora de Vendas', 'commercial', 'Vendas', null, 27),
  ('c6e4fd72-448f-503e-9e69-e48d4766e8c3', '862ca28c-0c67-5da3-ad24-cfdf825233c8', 'Coordenadora de Vendas', 'commercial', 'Vendas', '6f2b49af-3a2f-50d2-9ba5-45c80e5a3e70', 28),
  ('9153d68b-fd47-56cc-9a8f-10e651d30c30', 'd9a79ecb-199b-5788-8a3c-812ca55c4945', 'Especialista em Desenvolvimento de Negócios', 'commercial', 'Vendas', 'c6e4fd72-448f-503e-9e69-e48d4766e8c3', 29),
  ('3b9e5582-aa0f-5b03-b3e4-1f46f25442e1', '419c0471-b0fd-5441-b1ac-09220db3c573', 'Especialista em Desenvolvimento de Negócios', 'commercial', 'Vendas', 'c6e4fd72-448f-503e-9e69-e48d4766e8c3', 30),
  ('ad6cb0fd-2ada-59a2-834a-be4de3f0fdc8', 'b00c626e-b4cd-5afa-a977-a7eb41f66407', 'Especialista em Desenvolvimento de Negócios - Redes Sociais', 'commercial', 'Vendas', 'c6e4fd72-448f-503e-9e69-e48d4766e8c3', 31);

-- Anna already has a login.
update public.people p set user_id = u.id, email = u.email from auth.users u where lower(u.email) = 'anna.miguel@gmxgroup.com' and p.full_name = 'Anna Luiza Miguel';


-- ════ Brand pages (gmx/0005) ════
-- Brand pages: websites, landing pages, social media and contact details per
-- brand (one row of brand_pages per company, many brand_links). Read by
-- everyone signed in; edited by admins and the Marketing department leader.


create table public.brand_pages (
  company_id text primary key references public.companies (id) on delete cascade,
  tagline    text not null default '',
  about      text not null default '',
  updated_at timestamptz not null default now()
);

create table public.brand_links (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id) on delete cascade,
  kind       text not null check (kind in ('website', 'landing', 'social', 'phone', 'email', 'address', 'hours', 'other')),
  -- social: instagram | facebook | linkedin | youtube | tiktok | pinterest | x | whatsapp
  platform   text,
  label      text not null default '',
  -- URL for website/landing/social/other; the number/address/text otherwise.
  value      text not null check (length(btrim(value)) > 0),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_links_company_idx on public.brand_links (company_id, kind, sort);

create trigger brand_pages_updated_at before update on public.brand_pages for each row execute function public.set_updated_at();
create trigger brand_links_updated_at before update on public.brand_links for each row execute function public.set_updated_at();

alter table public.brand_pages enable row level security;
alter table public.brand_links enable row level security;
grant select, insert, update, delete on public.brand_pages, public.brand_links to authenticated;

create policy "read brand pages"   on public.brand_pages for select to authenticated using (true);
create policy "read brand links"   on public.brand_links for select to authenticated using (true);
create policy "manage brand pages" on public.brand_pages for all to authenticated
  using (public.can_manage('marketing')) with check (public.can_manage('marketing'));
create policy "manage brand links" on public.brand_links for all to authenticated
  using (public.can_manage('marketing')) with check (public.can_manage('marketing'));

-- Seed: what the brands' public websites list (read 2026-10-07).
insert into public.brand_pages (company_id) values ('gmx'), ('maximo'), ('lumberplus'), ('us4pro'), ('builderexpress');

insert into public.brand_links (company_id, kind, platform, label, value, sort) values
  -- GMX Group
  ('gmx', 'website', null, 'GMX Group', 'https://gmxgroup.com/', 0),
  ('gmx', 'phone',   null, 'Phone', '(888) 432-2559', 0),
  ('gmx', 'email',   null, 'Email', 'info@gmxgroup.com', 0),
  ('gmx', 'address', null, 'North American HQ', '20807 Biscayne Boulevard, Suite 304, Aventura, FL 33180, United States', 0),
  ('gmx', 'address', null, 'South American HQ', 'Al. Dr. Carlos de Carvalho, 603 - Suite 31, Curitiba, PR 80430-180, Brazil', 1),
  ('gmx', 'other',   null, 'Norx', 'https://norx.us/', 0),
  ('gmx', 'other',   null, 'Black Label Wood', 'https://blacklabelwood.com/', 1),
  ('gmx', 'other',   null, 'Thermowood', 'https://thermowood.com/', 2),
  -- Maximo
  ('maximo', 'website', null, 'Maximo Wood', 'https://maximowood.com/', 0),
  ('maximo', 'website', null, 'Thermo products', 'https://maximowood.com/thermo', 1),
  ('maximo', 'website', null, 'Dealer locator', 'https://maximowood.com/locate-dealer', 2),
  ('maximo', 'website', null, 'All projects', 'https://maximowood.com/all-projects', 3),
  ('maximo', 'website', null, 'Project gallery', 'https://photos.maximowood.com/', 4),
  ('maximo', 'landing', null, 'BurnBlock', 'https://lp.maximowood.com/burnblock/', 0),
  ('maximo', 'landing', null, 'Talk to a specialist', 'https://api.maximowood.com/talktospecialist/', 1),
  ('maximo', 'other',   null, 'Pre-Finished catalog 2026 (PDF)', 'https://api.maximowood.com/wp-content/uploads/2025/12/121225_WEB_MAXIMO-PRE-FINISHED_2026-CATALOG_v12_FL.pdf', 0),
  -- Lumber Plus
  ('lumberplus', 'website', null, 'Lumber Plus', 'https://www.lumberplus.com/', 0),
  ('lumberplus', 'website', null, 'Catalog', 'https://lumberplus.com/catalog', 1),
  ('lumberplus', 'website', null, 'Service areas', 'https://lumberplus.com/service-areas', 2),
  ('lumberplus', 'website', null, 'Decking calculator', 'https://lumberplus.com/decking-calculator', 3),
  ('lumberplus', 'website', null, 'Blog', 'https://lumberplus.com/blog', 4),
  ('lumberplus', 'landing', null, 'Contact / quote', 'https://lumberplus.com/contact-us', 0),
  ('lumberplus', 'social', 'instagram', 'Instagram', 'https://www.instagram.com/lumberplus', 0),
  ('lumberplus', 'social', 'facebook',  'Facebook',  'https://www.facebook.com/lumberplus', 1),
  ('lumberplus', 'social', 'linkedin',  'LinkedIn',  'https://www.linkedin.com/company/lumberplus', 2),
  ('lumberplus', 'social', 'youtube',   'YouTube',   'https://www.youtube.com/@lumberplus', 3),
  ('lumberplus', 'phone', null, 'Miami, FL', '(786) 206-8899', 0),
  ('lumberplus', 'phone', null, 'Tampa, FL', '(813) 768-1811', 1),
  ('lumberplus', 'phone', null, 'Palm Beach, FL', '(561) 467-5539', 2),
  ('lumberplus', 'phone', null, 'South Dade, FL', '(305) 514-0859', 3),
  ('lumberplus', 'phone', null, 'Houston, TX', '(281) 915-0770', 4),
  ('lumberplus', 'phone', null, 'Boston, MA', '(508) 565-8494', 5),
  ('lumberplus', 'phone', null, 'Nantucket, MA', '(774) 236-9644', 6),
  ('lumberplus', 'phone', null, 'New York, NY', '(934) 949-2639', 7),
  ('lumberplus', 'phone', null, 'Dominican Republic', '(849) 512-4025', 8),
  ('lumberplus', 'address', null, 'Miami', '255 NE 181st St, Miami, FL 33162', 0),
  ('lumberplus', 'address', null, 'Tampa', '12745 49th St N, Clearwater, FL 33762', 1),
  ('lumberplus', 'address', null, 'Houston', '10040 FM 1960 Rd W, Houston, TX 77070', 2),
  ('lumberplus', 'hours', null, 'Miami', 'Mon–Fri 8am–5pm · Sat 8:30am–12:30pm', 0),
  -- US4
  ('us4pro', 'website', null, 'US4', 'https://us4pro.com/', 0),
  -- Builder Express
  ('builderexpress', 'website', null, 'Builder Express', 'https://builderexpress.com/', 0),
  ('builderexpress', 'website', null, 'Deck builder', 'https://builderexpress.com/deck-builder', 1),
  ('builderexpress', 'website', null, 'Wall builder', 'https://builderexpress.com/wall-builder', 2),
  ('builderexpress', 'website', null, 'Ceiling builder', 'https://builderexpress.com/ceiling-builder', 3),
  ('builderexpress', 'website', null, 'Find a contractor', 'https://builderexpress.com/contractors', 4),
  ('builderexpress', 'landing', null, 'Trade portal', 'https://partner-production-a77b.up.railway.app/login', 0),
  ('builderexpress', 'phone', null, 'Phone', '(904) 914-7035', 0);


-- ════ Personal profile (gmx/0006) ════
-- A more personal profile: languages spoken, office, birthday (day + month
-- only — no year, so ages aren't shown) and company start date (anniversaries).
-- Each person edits their own (policy "edit own person" from 0003).

alter table public.people
  add column if not exists languages   text[] not null default '{}',
  add column if not exists office      text check (office in ('curitiba', 'aventura', 'lumberplus-miami', 'remote')),
  add column if not exists birth_month smallint check (birth_month between 1 and 12),
  add column if not exists birth_day   smallint check (birth_day between 1 and 31),
  add column if not exists start_date  date check (start_date >= date '1990-01-01'),
  add constraint people_birthday_complete check ((birth_month is null) = (birth_day is null));

-- ════ Engagement (gmx/0007) ════
-- Intranet engagement features (benchmark, 2026-10-08):
-- personal shortcuts, news must-read + acknowledgements + reactions,
-- who's out, department FAQs, kudos, onboarding checklist, profile skills,
-- (The UI language is a per-browser cookie, not stored here.)
-- Everyone signed in reads; people manage their own rows; admins and the
-- relevant department leader manage shared content (public.can_manage).


-- ── Profile: skills / "ask me about" ─────────────────────────────────────────
alter table public.people
  add column if not exists skills text[] not null default '{}';

-- ── Personal shortcuts (⭐) ───────────────────────────────────────────────────
create table public.shortcuts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null check (length(btrim(title)) > 0),
  href       text not null check (href ~ '^(/|https?://)'),
  external   boolean not null default false,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, href)
);

-- ── News: must-read, language, acknowledgements, reactions ──────────────────
alter table public.news
  add column if not exists must_read boolean not null default false,
  add column if not exists language  text check (language in ('en', 'es', 'pt'));

create table public.news_reads (
  news_id uuid not null references public.news (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (news_id, user_id)
);

create table public.news_reactions (
  news_id uuid not null references public.news (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  emoji   text not null check (emoji in ('👍', '❤️', '🎉', '👏')),
  primary key (news_id, user_id, emoji)
);

-- ── Who's out ────────────────────────────────────────────────────────────────
create table public.absences (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people (id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  kind       text not null default 'vacation' check (kind in ('vacation', 'sick', 'travel', 'ooo', 'holiday')),
  note       text not null default '',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index absences_dates_idx on public.absences (ends_on, starts_on);

-- ── Department FAQs / how-tos ────────────────────────────────────────────────
create table public.faqs (
  id            uuid primary key default gen_random_uuid(),
  department_id text references public.departments (id),
  question      text not null check (length(btrim(question)) > 0),
  answer        text not null default '',
  language      text check (language in ('en', 'es', 'pt')),
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger faqs_updated_at before update on public.faqs for each row execute function public.set_updated_at();

-- ── Kudos ────────────────────────────────────────────────────────────────────
create table public.kudos (
  id             uuid primary key default gen_random_uuid(),
  from_person_id uuid not null references public.people (id) on delete cascade,
  to_person_id   uuid not null references public.people (id) on delete cascade,
  message        text not null check (length(btrim(message)) between 1 and 500),
  created_at     timestamptz not null default now(),
  check (from_person_id <> to_person_id)
);
create index kudos_created_idx on public.kudos (created_at desc);

-- ── Onboarding checklist ─────────────────────────────────────────────────────
create table public.onboarding_items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  description   text not null default '',
  link          text,
  department_id text references public.departments (id),
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

create table public.onboarding_progress (
  item_id uuid not null references public.onboarding_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

insert into public.onboarding_items (title, description, link, sort) values
  ('Complete your profile', 'Add your office, languages, birthday, start date and what people can ask you about.', '/profile', 1),
  ('Find yourself in the org chart', 'Claim your entry and set your title, team and manager.', '/people', 2),
  ('Explore your department', 'See the tools, documents and FAQs your team uses.', '/', 3),
  ('Star the tools you use most', 'Use ☆ on any tool to add it to your shortcuts on the home page.', '/', 4),
  ('Read the must-read announcements', 'Confirm you have read the company announcements marked as must-read.', '/news', 5),
  ('Check the calendar', 'US and Brazil holidays and company events.', '/calendar', 6);

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.shortcuts           enable row level security;
alter table public.news_reads          enable row level security;
alter table public.news_reactions      enable row level security;
alter table public.absences            enable row level security;
alter table public.faqs                enable row level security;
alter table public.kudos               enable row level security;
alter table public.onboarding_items    enable row level security;
alter table public.onboarding_progress enable row level security;

grant select, insert, update, delete on
  public.shortcuts, public.news_reads, public.news_reactions, public.absences,
  public.faqs, public.kudos, public.onboarding_items, public.onboarding_progress
  to authenticated;

create policy "own shortcuts" on public.shortcuts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read news reads" on public.news_reads for select to authenticated using (true);
create policy "mark read"       on public.news_reads for insert to authenticated with check (user_id = auth.uid());
create policy "unmark read"     on public.news_reads for delete to authenticated using (user_id = auth.uid());

create policy "read reactions"   on public.news_reactions for select to authenticated using (true);
create policy "add reaction"     on public.news_reactions for insert to authenticated with check (user_id = auth.uid());
create policy "remove reaction"  on public.news_reactions for delete to authenticated using (user_id = auth.uid());

create policy "read absences"   on public.absences for select to authenticated using (true);
create policy "own absences"    on public.absences for all to authenticated
  using (person_id = public.my_person_id() or public.is_admin())
  with check (person_id = public.my_person_id() or public.is_admin());

create policy "read faqs"   on public.faqs for select to authenticated using (true);
create policy "manage faqs" on public.faqs for all to authenticated
  using (public.is_admin() or public.can_manage(department_id))
  with check (public.is_admin() or public.can_manage(department_id));

create policy "read kudos"   on public.kudos for select to authenticated using (true);
create policy "give kudos"   on public.kudos for insert to authenticated with check (from_person_id = public.my_person_id());
create policy "remove kudos" on public.kudos for delete to authenticated using (from_person_id = public.my_person_id() or public.is_admin());

create policy "read onboarding items"   on public.onboarding_items for select to authenticated using (true);
create policy "manage onboarding items" on public.onboarding_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "own onboarding progress" on public.onboarding_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ════ Existing accounts get a profile now ════
insert into public.profiles (user_id, email, full_name, company_id)
select u.id, lower(u.email), coalesce(u.raw_user_meta_data ->> 'name', ''),
       (select d.company_id from public.allowed_email_domains d where d.domain = lower(split_part(u.email, '@', 2)))
  from auth.users u
on conflict (user_id) do nothing;

commit;

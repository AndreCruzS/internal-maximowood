-- People and org chart. Everyone in the company is a person (with or without an
-- intranet login); a person can hold more than one position (e.g. a manager of
-- two teams). The org chart is the tree of positions via reports_to.

begin;

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

-- Link a person to their login by email when the account is created.
create or replace function public.link_person_to_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.people set user_id = new.id
  where user_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger link_person_to_user after insert on auth.users
  for each row execute function public.link_person_to_user();

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

commit;

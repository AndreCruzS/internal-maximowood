-- Onboarding, two ways:
--  1. A leader adds a new employee (create_new_hire): the person and position go
--     into the org chart right away, and IT gets a setup request (company email,
--     RingCentral number, accounts). IT sends the passwords to the personal email
--     outside the intranet — passwords are never stored here.
--  2. The employee signs in with the new company email: they are linked to the
--     prepared entry (ensure_my_profile → link_new_hire), fill in the welcome
--     questionnaire, then follow the training path (GMX → their brand → their
--     department's resources), each module with a quiz graded on the server.
-- Also: per-person department access (profiles.access_departments) for
-- department-only documents and playbooks.

begin;

-- ── Department access ────────────────────────────────────────────────────────
alter table public.profiles add column if not exists access_departments text[] not null default '{}';

-- Departments whose department-only content I can see: my profile department,
-- every department I hold a position in, and the extra ones I was given.
create or replace function public.my_departments() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct d), '{}') from (
    select department_id as d from public.profiles where user_id = auth.uid() and department_id is not null
    union select unnest(access_departments) from public.profiles where user_id = auth.uid()
    union select department_id from public.positions where person_id = public.my_person_id() and department_id is not null
  ) x
$$;

drop policy if exists "read visible links" on public.links;
create policy "read visible links" on public.links for select to authenticated
  using (visibility = 'everyone' or department_id = any (public.my_departments()) or public.can_manage(department_id));

alter table public.playbooks add column if not exists visibility text not null default 'everyone'
  check (visibility in ('everyone', 'department'));
drop policy if exists "read playbooks" on public.playbooks;
create policy "read playbooks" on public.playbooks for select to authenticated
  using (
    public.in_department(department_id) or public.is_admin()
    or (status = 'published' and (visibility = 'everyone' or department_id = any (public.my_departments())))
  );

-- ── New hires ────────────────────────────────────────────────────────────────
create table public.new_hires (
  id                 uuid primary key default gen_random_uuid(),
  person_id          uuid not null unique references public.people (id) on delete cascade,
  full_name          text not null check (length(btrim(full_name)) > 0),
  personal_email     text not null check (personal_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  title              text not null default '',
  department_id      text references public.departments (id),
  reports_to         uuid references public.people (id) on delete set null,
  company_id         text references public.companies (id),
  start_date         date,
  needs_email        boolean not null default true,
  needs_phone        boolean not null default false,
  phone_area_code    text,
  access_departments text[] not null default '{}',
  notes              text not null default '',
  -- Filled in by IT:
  company_email      text check (company_email is null or company_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone_number       text,
  accounts           jsonb not null default '[]'::jsonb check (jsonb_typeof(accounts) = 'array'), -- [{ "name", "login", "url" }]
  it_notes           text not null default '',
  status             text not null default 'it_setup' check (status in ('it_setup', 'ready', 'onboarding', 'done', 'cancelled')),
  it_done_at         timestamptz,
  it_done_by         uuid references auth.users (id) on delete set null,
  linked_at          timestamptz,
  created_by         uuid references auth.users (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index new_hires_status_idx on public.new_hires (status, start_date);
create unique index new_hires_company_email_idx on public.new_hires (lower(company_email)) where company_email is not null;
create trigger new_hires_updated_at before update on public.new_hires for each row execute function public.set_updated_at();

alter table public.new_hires enable row level security;
grant select, update on public.new_hires to authenticated;

-- What IT sets up (company email, RingCentral number) flows into the org chart entry.
create or replace function public.sync_new_hire_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.company_email is distinct from old.company_email or new.phone_number is distinct from old.phone_number then
    update public.people
       set email = coalesce(lower(new.company_email), email),
           phone = coalesce(new.phone_number, phone)
     where id = new.person_id;
  end if;
  return new;
end;
$$;
create trigger new_hires_sync_contact after update on public.new_hires for each row execute function public.sync_new_hire_contact();

-- Leaders and admins add people; IT and the leader who added them follow up.
create or replace function public.can_add_hires() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.my_role() = 'leader'
$$;
create or replace function public.is_it() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.in_department('it')
$$;

create policy "see new hires" on public.new_hires for select to authenticated
  using (created_by = auth.uid() or public.is_it() or public.can_manage(department_id) or person_id = public.my_person_id());
create policy "IT and the hiring leader update" on public.new_hires for update to authenticated
  using (created_by = auth.uid() or public.is_it() or public.can_manage(department_id))
  with check (created_by = auth.uid() or public.is_it() or public.can_manage(department_id));

-- Creates the person, their position (reporting to the manager's main position)
-- and the IT request in one go.
create or replace function public.create_new_hire(hire jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  boss uuid := nullif(hire ->> 'reports_to', '')::uuid;
  dept text := nullif(hire ->> 'department_id', '');
  hire_id uuid;
begin
  if not public.can_add_hires() then raise exception 'Only leaders and admins can add new employees'; end if;
  insert into public.people (full_name, company_id, companies, start_date, active)
  values (btrim(hire ->> 'full_name'), nullif(hire ->> 'company_id', ''),
          case when nullif(hire ->> 'company_id', '') is null then '{}' else array[hire ->> 'company_id'] end,
          nullif(hire ->> 'start_date', '')::date, true)
  returning id into pid;
  insert into public.positions (person_id, title, department_id, reports_to, sort)
  values (pid, coalesce(nullif(btrim(hire ->> 'title'), ''), 'New employee'), dept,
          case when boss is null then null else public.primary_position(boss) end, 1000);
  insert into public.new_hires (person_id, full_name, personal_email, title, department_id, reports_to, company_id, start_date,
                                needs_email, needs_phone, phone_area_code, access_departments, notes)
  values (pid, btrim(hire ->> 'full_name'), lower(btrim(hire ->> 'personal_email')), coalesce(btrim(hire ->> 'title'), ''), dept, boss,
          nullif(hire ->> 'company_id', ''), nullif(hire ->> 'start_date', '')::date,
          coalesce((hire ->> 'needs_email')::boolean, true), coalesce((hire ->> 'needs_phone')::boolean, false),
          nullif(btrim(hire ->> 'phone_area_code'), ''),
          coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(hire -> 'access_departments', '[]'::jsonb)) x), '{}'),
          coalesce(hire ->> 'notes', ''))
  returning id into hire_id;
  return hire_id;
end;
$$;
revoke execute on function public.create_new_hire(jsonb) from anon;

-- First sign-in with the company email IT created: link to the prepared entry.
create or replace function public.link_new_hire() returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_email text;
  h public.new_hires;
begin
  if me is null or public.my_person_id() is not null then return; end if;
  select lower(email) into my_email from auth.users where id = me;
  select * into h from public.new_hires
   where lower(company_email) = my_email and status in ('it_setup', 'ready') limit 1;
  if h.id is null then return; end if;
  update public.people set user_id = me, email = my_email, phone = coalesce(phone, h.phone_number)
   where id = h.person_id and user_id is null;
  if not found then return; end if;
  update public.profiles
     set department_id = coalesce(department_id, h.department_id),
         company_id = coalesce(h.company_id, company_id),
         access_departments = h.access_departments
   where user_id = me;
  update public.new_hires set status = 'onboarding', linked_at = now() where id = h.id;
end;
$$;
revoke execute on function public.link_new_hire() from anon;

create or replace function public.ensure_my_profile() returns void
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
  perform public.link_new_hire();
end;
$$;

-- ── Training ─────────────────────────────────────────────────────────────────
create table public.training_modules (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('gmx', 'brand', 'department')),
  company_id    text references public.companies (id),
  department_id text references public.departments (id),
  title         text not null check (length(btrim(title)) > 0),
  summary       text not null default '',
  content_kind  text not null default 'slides' check (content_kind in ('slides', 'pdf', 'video', 'link', 'text', 'resources')),
  content_url   text,
  body          text not null default '',
  pass_mark     int not null default 80 check (pass_mark between 0 and 100),
  sort          int not null default 0,
  published     boolean not null default false,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (scope <> 'brand' or company_id is not null),
  check (scope <> 'department' or department_id is not null)
);
create trigger training_modules_updated_at before update on public.training_modules for each row execute function public.set_updated_at();

-- Questions are readable by everyone; the right answers live apart, for editors only.
create table public.training_questions (
  id        uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules (id) on delete cascade,
  question  text not null check (length(btrim(question)) > 0),
  options   jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  multiple  boolean not null default false,
  sort      int not null default 0
);
create table public.training_answers (
  question_id uuid primary key references public.training_questions (id) on delete cascade,
  correct     int[] not null check (cardinality(correct) >= 1),
  explanation text not null default ''
);
create table public.training_attempts (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references public.training_modules (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score      int not null,
  passed     boolean not null,
  answers    jsonb not null,
  created_at timestamptz not null default now()
);
create index training_attempts_user_idx on public.training_attempts (user_id, module_id, created_at desc);

alter table public.training_modules   enable row level security;
alter table public.training_questions enable row level security;
alter table public.training_answers   enable row level security;
alter table public.training_attempts  enable row level security;
grant select, insert, update, delete on public.training_modules, public.training_questions, public.training_answers to authenticated;
grant select on public.training_attempts to authenticated;

create or replace function public.can_edit_training() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.my_role() = 'leader'
$$;

create policy "read modules" on public.training_modules for select to authenticated using (published or public.can_edit_training());
create policy "edit modules" on public.training_modules for all to authenticated
  using (public.can_edit_training()) with check (public.can_edit_training());
create policy "read questions" on public.training_questions for select to authenticated
  using (exists (select 1 from public.training_modules m where m.id = module_id and (m.published or public.can_edit_training())));
create policy "edit questions" on public.training_questions for all to authenticated
  using (public.can_edit_training()) with check (public.can_edit_training());
create policy "editors read answers" on public.training_answers for select to authenticated using (public.can_edit_training());
create policy "edit answers" on public.training_answers for all to authenticated
  using (public.can_edit_training()) with check (public.can_edit_training());
-- Own attempts; leaders/admins/IT see everyone's progress for the dashboard.
create policy "see attempts" on public.training_attempts for select to authenticated
  using (user_id = auth.uid() or public.can_add_hires());

-- Grade a quiz on the server. answers: { "<question id>": [option indexes] }.
-- Returns the score, whether it passed, and per-question results with explanations.
create or replace function public.submit_quiz(module uuid, answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.training_modules;
  total int := 0;
  right_n int := 0;
  pct int;
  results jsonb := '[]'::jsonb;
  q record;
  mine int[];
  ok boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into m from public.training_modules where id = module and published;
  if m.id is null then raise exception 'This module is not available'; end if;
  for q in
    select tq.id, a.correct, a.explanation from public.training_questions tq
      join public.training_answers a on a.question_id = tq.id
     where tq.module_id = module order by tq.sort, tq.id
  loop
    total := total + 1;
    mine := coalesce((select array_agg(x::int order by x::int) from jsonb_array_elements_text(coalesce(answers -> q.id::text, '[]'::jsonb)) x), '{}');
    ok := mine = (select array_agg(c order by c) from unnest(q.correct) c);
    if ok then right_n := right_n + 1; end if;
    results := results || jsonb_build_object('question', q.id, 'correct', ok, 'answer', to_jsonb(q.correct), 'explanation', q.explanation);
  end loop;
  pct := case when total = 0 then 100 else round(right_n * 100.0 / total) end;
  insert into public.training_attempts (module_id, user_id, score, passed, answers)
  values (module, auth.uid(), pct, pct >= m.pass_mark, coalesce(answers, '{}'::jsonb));
  return jsonb_build_object('score', pct, 'passed', pct >= m.pass_mark, 'right', right_n, 'total', total, 'results', results);
end;
$$;
revoke execute on function public.submit_quiz(uuid, jsonb) from anon;

-- ── First module (draft): GMX Group, from the brand guide ────────────────────
with m as (
  insert into public.training_modules (scope, title, summary, content_kind, content_url, body, pass_mark, sort, published)
  values ('gmx', 'Welcome to GMX Group', 'Who we are, our symbol, our colors and the companies in the group.', 'pdf',
          '/brand-kit/gmx/gmx-group-brand-guide.pdf',
          E'GMX Group is the new name of Global Forest. More than redoing the old logo, the new brand translates GMX''s care for the forests, their well-being and, above all, sustainability.\n\nThe symbol blends equilibrium and nature: two minimalist trees showing that we never take anything from nature without guaranteeing a balance — for every tree we harvest, another one takes its place.\n\nOur brand colors are Forest Green (#009F67) and Black. Our typefaces are Lato (brand and body text) and Eurostyle Extended (titles).\n\nGMX Group brings together Maximo, Lumber Plus, US4, Builder Express and Global LBM.\n\n"Making sustainability our business."',
          80, 1, false)
  returning id
), q as (
  insert into public.training_questions (module_id, question, options, multiple, sort)
  select m.id, x.question, x.options::jsonb, x.multiple, x.sort from m, (values
    ('What was GMX Group called before?', '["Global Forest", "Maximo Group", "Lumber Plus Holdings", "Global LBM"]', false, 1),
    ('What does the GMX symbol show?', '["Two minimalist trees: for every tree we harvest, another takes its place", "A mountain range", "A wave and the sun", "The letters G and X"]', false, 2),
    ('What is the GMX brand color?', '["Forest Green #009F67", "Ipe Yellow #F6CA21", "Proud Blue #2573F2", "Builder Teal #09ADBE"]', false, 3),
    ('Which typeface is used for GMX body text?', '["Lato", "Montserrat", "Anybody", "TT Fors"]', false, 4),
    ('Which of these companies are part of GMX Group? (select all that apply)', '["Maximo", "Lumber Plus", "US4", "Builder Express", "Global LBM"]', true, 5)
  ) as x(question, options, multiple, sort)
  returning id, sort
)
insert into public.training_answers (question_id, correct, explanation)
select q.id, a.correct, a.explanation from q join (values
  (1, '{0}'::int[], 'Global Forest is now GMX Group.'),
  (2, '{0}'::int[], 'The symbol blends equilibrium and nature.'),
  (3, '{0}'::int[], 'Forest Green (Pantone 6164 C) and Black are the GMX colors.'),
  (4, '{0}'::int[], 'Lato for brand and body text; Eurostyle Extended for titles.'),
  (5, '{0,1,2,3,4}'::int[], 'All five are GMX Group companies.')
) as a(sort, correct, explanation) on a.sort = q.sort;

commit;

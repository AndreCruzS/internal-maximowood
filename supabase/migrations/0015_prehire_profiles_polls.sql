-- Onboarding tracker, richer profiles, quick polls and sample training:
--  * new_hires: "before you hire" checklist (manual ticks), onboarding buddy,
--    first-day details and a first day / week / month / quarter plan the new hire sees.
--  * people: a real profile — headline, bio, pronouns, interests, fun fact, cover, LinkedIn, photo upload.
--  * kudos.gif: send the "Good job" GIF with a kudo.
--  * polls: quick polls on the home page; votes are private, only totals are shown.
--  * training_modules.is_sample: sample modules only training editors see, to preview the flow.

begin;

-- ── Before you hire ──────────────────────────────────────────────────────────
alter table public.new_hires
  add column if not exists buddy_id  uuid references public.people (id) on delete set null,
  add column if not exists first_day text not null default '',
  -- [{ "phase": "day" | "week" | "month" | "quarter", "text": "…" }]
  add column if not exists plan      jsonb not null default '[]'::jsonb check (jsonb_typeof(plan) = 'array'),
  -- { "<item key>": { "at": "<timestamp>", "by": "<user id>" } } — items ticked by hand
  add column if not exists checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object');

-- ── Profiles ─────────────────────────────────────────────────────────────────
alter table public.people
  add column if not exists headline  text not null default '' check (length(headline) <= 120),
  add column if not exists bio       text not null default '' check (length(bio) <= 2000),
  add column if not exists pronouns  text not null default '' check (length(pronouns) <= 40),
  add column if not exists interests text[] not null default '{}',
  add column if not exists fun_fact  text not null default '' check (length(fun_fact) <= 300),
  add column if not exists cover     text not null default 'forest',
  add column if not exists linkedin  text check (linkedin is null or linkedin ~* '^https://([a-z]+\.)?linkedin\.com/');

-- Profile photos: private bucket, served to signed-in people through /avatars/…
-- Each person writes only in their own folder: <people.id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "read avatars" on storage.objects;
create policy "read avatars" on storage.objects for select to authenticated using (bucket_id = 'avatars');
drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_person_id()::text);
drop policy if exists "replace own avatar" on storage.objects;
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_person_id()::text);
drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = public.my_person_id()::text or public.is_admin()));

-- ── Kudos GIFs ───────────────────────────────────────────────────────────────
-- Optional GIF sent with a kudo (a file in /public/kudos, e.g. 'nice').
alter table public.kudos add column if not exists gif text check (gif is null or gif ~ '^[a-z0-9-]{1,40}$');
-- A kudo can be just the GIF, without a note.
alter table public.kudos drop constraint if exists kudos_message_check;
alter table public.kudos add constraint kudos_message_check
  check (length(btrim(message)) <= 500 and (length(btrim(message)) >= 1 or gif is not null));

-- ── Quick polls ──────────────────────────────────────────────────────────────
create table public.polls (
  id         uuid primary key default gen_random_uuid(),
  question   text not null check (length(btrim(question)) between 1 and 300),
  options    jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  multiple   boolean not null default false,
  closes_at  timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  choices    int[] not null check (cardinality(choices) >= 1),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
alter table public.polls      enable row level security;
alter table public.poll_votes enable row level security;
grant select, insert, update, delete on public.polls to authenticated;
grant select, delete on public.poll_votes to authenticated;

create or replace function public.can_create_polls() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.my_role() = 'leader'
$$;

create policy "read polls" on public.polls for select to authenticated using (true);
create policy "create polls" on public.polls for insert to authenticated with check (public.can_create_polls() and created_by = auth.uid());
create policy "edit own polls" on public.polls for update to authenticated
  using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());
create policy "delete own polls" on public.polls for delete to authenticated using (created_by = auth.uid() or public.is_admin());
-- Votes are private: you see (and can take back) only your own.
create policy "own votes" on public.poll_votes for select to authenticated using (user_id = auth.uid());
create policy "take back own vote" on public.poll_votes for delete to authenticated using (user_id = auth.uid());

-- Vote (or change your vote) while the poll is open.
create or replace function public.vote_poll(poll uuid, choices int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.polls;
  n int;
  c int[] := (select array_agg(distinct x order by x) from unnest(choices) x);
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into p from public.polls where id = poll;
  if p.id is null then raise exception 'Poll not found'; end if;
  if p.closes_at is not null and p.closes_at < now() then raise exception 'This poll is closed'; end if;
  n := jsonb_array_length(p.options);
  if c is null or exists (select 1 from unnest(c) x where x < 0 or x >= n) then raise exception 'Pick an option'; end if;
  if not p.multiple and cardinality(c) > 1 then raise exception 'Pick one option'; end if;
  insert into public.poll_votes (poll_id, user_id, choices) values (poll, auth.uid(), c)
  on conflict (poll_id, user_id) do update set choices = excluded.choices, created_at = now();
end;
$$;
revoke execute on function public.vote_poll(uuid, int[]) from anon;

-- Totals per option (never who voted what).
create or replace function public.poll_results(poll uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'voters', (select count(*) from public.poll_votes v where v.poll_id = poll),
    'counts', coalesce((
      select jsonb_agg(coalesce(cnt, 0) order by i)
        from generate_series(0, (select jsonb_array_length(options) - 1 from public.polls where id = poll)) i
        left join (select x as opt, count(*) as cnt from public.poll_votes v, unnest(v.choices) x where v.poll_id = poll group by x) t on t.opt = i
    ), '[]'::jsonb))
  where auth.uid() is not null
$$;
revoke execute on function public.poll_results(uuid) from anon;

insert into public.polls (question, options, closes_at, created_by)
select 'How satisfied are you with the new intranet?',
       '["😍 Very satisfied", "🙂 Satisfied", "😐 Neutral", "🙁 Dissatisfied"]'::jsonb,
       now() + interval '30 days',
       (select user_id from public.profiles where lower(email) = 'anna.miguel@gmxgroup.com')
where not exists (select 1 from public.polls);

-- ── Sample training (editors only) ───────────────────────────────────────────
alter table public.training_modules add column if not exists is_sample boolean not null default false;

drop policy if exists "read modules" on public.training_modules;
create policy "read modules" on public.training_modules for select to authenticated
  using ((published and not is_sample) or public.can_edit_training());
drop policy if exists "read questions" on public.training_questions;
create policy "read questions" on public.training_questions for select to authenticated
  using (exists (select 1 from public.training_modules m where m.id = module_id and ((m.published and not m.is_sample) or public.can_edit_training())));

-- Three sample steps — GMX (text), brand (PDF) and department (resources) — each with a quiz.
create temporary table sample_modules (key text, scope text, company_id text, department_id text, title text, summary text,
  content_kind text, content_url text, body text, sort int) on commit drop;
insert into sample_modules values
  ('intranet', 'gmx', null, null, 'Sample · Getting around the intranet',
   'A sample step: how the GMX intranet is organized.', 'text', null,
   E'This is a SAMPLE module — only training editors see it. It shows how a real step will look for a new hire.\n\n'
   'The intranet has five places you will use every day:\n'
   '• Home — news, events, who is out, celebrations, kudos and the quick poll.\n'
   '• People — the directory and the org chart. Click anyone to see their profile and contact them on Gmail, Slack or RingCentral.\n'
   '• Departments — each department''s tools, playbooks, documents and FAQs.\n'
   '• Brands — logos, colors, fonts and materials for Maximo, Lumber Plus, US4, Builder Express and Global LBM.\n'
   '• Onboarding — your roadmap, your training and your accounts.\n\n'
   'Tip: star (⭐) any tool to add it to your shortcuts on the home page.',
   901),
  ('brand', 'brand', 'maximo', null, 'Sample · Maximo brand basics',
   'A sample brand step with a PDF presentation (the Maximo brand guide).', 'pdf', '/brand-kit/maximo/maximo-brand-guide-v7.pdf',
   E'This is a SAMPLE brand module. Real brand modules can use Google Slides, a PDF or a video.\n\n'
   'Scroll through the Maximo brand guide above, then take the short quiz. The brand page (Brands → Maximo) always has the latest logos and files.',
   902),
  ('dept', 'department', null, 'commercial', 'Sample · Commercial: your tools and accounts',
   'A sample department step: important links, your accounts and what you can see.', 'resources', null,
   E'This is a SAMPLE department module. For a real new hire it lists the department''s pinned links, the accounts IT created for them, and the departments whose documents they can open.',
   903);

create temporary table sample_questions (key text, sort int, question text, options jsonb, multiple boolean, correct int[], explanation text) on commit drop;
insert into sample_questions values
  ('intranet', 1, 'Where do you find a colleague''s Slack and RingCentral links?', '["People — click their card", "Brands", "Help"]', false, '{0}', 'Every profile on People has Gmail, Slack and RingCentral buttons.'),
  ('intranet', 2, 'How do you add a tool to your home page shortcuts?', '["Star it (⭐)", "Ask IT", "It is not possible"]', false, '{0}', 'Starred tools show up under My shortcuts on the home page.'),
  ('intranet', 3, 'What can you find on a department page? (select all that apply)', '["Tools", "Playbooks & documents", "FAQs", "Payroll"]', true, '{0,1,2}', 'Department pages have tools, playbooks & documents, FAQs and the team.'),
  ('brand', 1, 'Where are the latest Maximo logos and files?', '["Brands → Maximo", "In my email", "On my desktop"]', false, '{0}', 'Brand pages always have the current brand kit.'),
  ('brand', 2, 'Which formats can a brand training use?', '["Google Slides, PDF or video", "Only paper", "Only video"]', false, '{0}', 'Editors pick Google Slides, a PDF, a video, a link or plain text.'),
  ('dept', 1, 'Where were your passwords sent?', '["To my personal email", "They are on this page", "On Slack"]', false, '{0}', 'Passwords are never stored in the intranet — IT sends them to your personal email.'),
  ('dept', 2, 'Who do you ask when an account does not work?', '["The IT team", "Marketing", "Nobody"]', false, '{0}', 'IT created your accounts and can fix them.');

create temporary table sample_ids on commit drop as
with ins as (
  insert into public.training_modules (scope, company_id, department_id, title, summary, content_kind, content_url, body, pass_mark, sort, published, is_sample)
  select s.scope, s.company_id, s.department_id, s.title, s.summary, s.content_kind, s.content_url, s.body, 60, s.sort, true, true
    from sample_modules s
   where not exists (select 1 from public.training_modules m where m.title = s.title)
  returning id, title
)
select ins.id, s.key from ins join sample_modules s on s.title = ins.title;

with q as (
  insert into public.training_questions (module_id, question, options, multiple, sort)
  select i.id, sq.question, sq.options, sq.multiple, sq.sort from sample_questions sq join sample_ids i on i.key = sq.key
  returning id, module_id, sort
)
insert into public.training_answers (question_id, correct, explanation)
select q.id, sq.correct, sq.explanation
  from q join sample_ids i on i.id = q.module_id join sample_questions sq on sq.key = i.key and sq.sort = q.sort;

commit;

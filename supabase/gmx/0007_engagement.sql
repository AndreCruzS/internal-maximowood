-- Intranet engagement features (benchmark, 2026-10-08):
-- personal shortcuts, news must-read + acknowledgements + reactions,
-- who's out, department FAQs, kudos, onboarding checklist, profile skills,
-- (The UI language is a per-browser cookie, not stored here.)
-- Everyone signed in reads; people manage their own rows; admins and the
-- relevant department leader manage shared content (public.can_manage).

begin;

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

commit;

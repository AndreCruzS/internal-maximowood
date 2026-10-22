-- Birthday and work-anniversary wishes from colleagues ("Comemorações" on the home page).
--   * One message per colleague, per person, per occasion, per year (they can edit or remove it).
--   * Everyone signed in can read them, like a card the whole team signs; nobody wishes themselves.
--   * occasion_year = the year of the birthday / anniversary being celebrated.

begin;

create table if not exists public.celebration_wishes (
  id             uuid primary key default gen_random_uuid(),
  to_person_id   uuid not null references public.people (id) on delete cascade,
  from_person_id uuid not null references public.people (id) on delete cascade default public.my_person_id(),
  occasion       text not null check (occasion in ('birthday', 'anniversary')),
  occasion_year  int  not null check (occasion_year between 2020 and 2100),
  message        text not null check (length(btrim(message)) between 1 and 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (to_person_id <> from_person_id),
  unique (to_person_id, from_person_id, occasion, occasion_year)
);
create index if not exists celebration_wishes_to_idx on public.celebration_wishes (to_person_id, occasion_year);

drop trigger if exists celebration_wishes_updated_at on public.celebration_wishes;
create trigger celebration_wishes_updated_at before update on public.celebration_wishes
  for each row execute function public.set_updated_at();

alter table public.celebration_wishes enable row level security;
grant select, insert, update, delete on public.celebration_wishes to authenticated;

create policy "read wishes" on public.celebration_wishes for select to authenticated using (true);
create policy "send wishes" on public.celebration_wishes for insert to authenticated
  with check (from_person_id = public.my_person_id());
create policy "edit own wishes" on public.celebration_wishes for update to authenticated
  using (from_person_id = public.my_person_id()) with check (from_person_id = public.my_person_id());
create policy "remove own wishes" on public.celebration_wishes for delete to authenticated
  using (from_person_id = public.my_person_id() or public.is_admin());

notify pgrst, 'reload schema';

commit;

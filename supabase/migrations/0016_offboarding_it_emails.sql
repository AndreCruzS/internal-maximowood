-- Offboarding and IT emails.
--  * A leader, HR or an admin marks someone as offboarding (last day + notes);
--    IT gets an email and does everything on their side, then marks it done,
--    which archives the person (hidden from People, not deleted).
--  * New hires and offboardings both email IT (sent by the app from no-reply@);
--    email_log records every send so it happens once and IT can see it went out.
--  * HR (people in the HR department) can add new hires and start offboardings,
--    like leaders and admins.

begin;

create or replace function public.can_add_hires() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.my_role() = 'leader' or public.in_department('hr')
$$;

create table public.offboardings (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.people (id) on delete cascade,
  last_day   date not null,
  notes      text not null default '' check (length(notes) <= 2000),
  status     text not null default 'requested' check (status in ('requested', 'done', 'cancelled')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  done_by    uuid references auth.users (id) on delete set null
);
create unique index offboardings_open_idx on public.offboardings (person_id) where status = 'requested';
create index offboardings_status_idx on public.offboardings (status, last_day);

alter table public.offboardings enable row level security;
grant select, insert, update on public.offboardings to authenticated;

create policy "see offboardings" on public.offboardings for select to authenticated
  using (public.can_add_hires() or public.is_it());
create policy "start offboarding" on public.offboardings for insert to authenticated
  with check (public.can_add_hires() and created_by = auth.uid() and status = 'requested');
create policy "cancel offboarding" on public.offboardings for update to authenticated
  using (public.can_add_hires() or public.is_it())
  with check (public.can_add_hires() or public.is_it());

-- IT marks it done: the person is archived (active = false), so they leave People
-- and the org chart but nothing is deleted. An admin can bring them back.
create or replace function public.complete_offboarding(offboarding uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.offboardings;
begin
  if not public.is_it() then raise exception 'Only IT or an admin can complete an offboarding'; end if;
  select * into o from public.offboardings where id = offboarding and status = 'requested';
  if o.id is null then raise exception 'This offboarding is not open'; end if;
  update public.offboardings set status = 'done', done_at = now(), done_by = auth.uid() where id = o.id;
  update public.people set active = false where id = o.person_id;
end;
$$;
revoke execute on function public.complete_offboarding(uuid) from anon;

-- Written by the server only (service role); IT and admins can read it.
create table public.email_log (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('new_hire', 'offboarding')),
  ref_id     uuid not null,
  to_email   text not null,
  subject    text not null,
  status     text not null check (status in ('sent', 'failed', 'skipped')),
  error      text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index email_log_ref_idx on public.email_log (kind, ref_id, created_at desc);
alter table public.email_log enable row level security;
grant select on public.email_log to authenticated;
create policy "IT reads the email log" on public.email_log for select to authenticated
  using (public.is_it() or public.can_add_hires());

commit;

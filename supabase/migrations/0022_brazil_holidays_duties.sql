-- Brazil's national holidays (2026–2027; Carnaval and Corpus Christi are "ponto facultativo"),
-- remove the open roles copied from the Lumber Plus portal, and let a duty be given to an
-- email address (a shared mailbox like procurement@) before that account has signed in.

begin;

-- ── Duties by email ─────────────────────────────────────────────────────────
alter table public.duty_holders drop constraint if exists duty_holders_pkey;
alter table public.duty_holders alter column person_id drop not null;
alter table public.duty_holders add column if not exists id uuid not null default gen_random_uuid() primary key;
alter table public.duty_holders add column if not exists email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.duty_holders add constraint duty_holders_who check (person_id is not null or email is not null);
create unique index if not exists duty_holders_person_idx on public.duty_holders (duty, person_id) where person_id is not null;
create unique index if not exists duty_holders_email_idx on public.duty_holders (duty, lower(email)) where email is not null;

create or replace function public.has_duty(d text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.duty_holders h
     where h.duty = d
       and (h.person_id = public.my_person_id()
            or lower(h.email) = (select lower(u.email) from auth.users u where u.id = auth.uid()))
  )
$$;

-- Travel Procurement mailbox (Paulo Renelli already has access through Finance).
insert into public.duty_holders (duty, email) values
  ('procurement', 'procurement@gmxgroup.us'),
  ('procurement', 'procurement@gmxgroup.com')
on conflict do nothing;

-- ── Open roles: the six copied from the Lumber Plus portal aren't real ─────
delete from public.open_roles
 where created_by is null
   and title in ('Showroom Sales Associate', 'Inside Sales Representative', 'Logistics Coordinator',
                 'Field Installation Contractor', 'Marketing Designer', 'Payroll & Benefits Analyst');

-- ── Brazil · national holidays ──────────────────────────────────────────────
insert into public.office_holidays (calendar, day, name, kind, opens, closes, note) values
  ('br', '2026-01-01', 'Confraternização Universal (New Year''s Day)', 'closed', null, null, ''),
  ('br', '2026-02-16', 'Carnaval (Monday)', 'closed', null, null, 'Ponto facultativo — optional federal day'),
  ('br', '2026-02-17', 'Carnaval (Tuesday)', 'closed', null, null, 'Ponto facultativo — optional federal day'),
  ('br', '2026-04-03', 'Sexta-feira Santa (Good Friday)', 'closed', null, null, ''),
  ('br', '2026-04-21', 'Tiradentes', 'closed', null, null, ''),
  ('br', '2026-05-01', 'Dia do Trabalho (Labour Day)', 'closed', null, null, ''),
  ('br', '2026-06-04', 'Corpus Christi', 'closed', null, null, 'Ponto facultativo — optional federal day'),
  ('br', '2026-09-07', 'Independência do Brasil', 'closed', null, null, ''),
  ('br', '2026-10-12', 'Nossa Senhora Aparecida', 'closed', null, null, ''),
  ('br', '2026-11-02', 'Finados', 'closed', null, null, ''),
  ('br', '2026-11-15', 'Proclamação da República', 'closed', null, null, ''),
  ('br', '2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'closed', null, null, ''),
  ('br', '2026-12-25', 'Natal (Christmas Day)', 'closed', null, null, ''),
  ('br', '2027-01-01', 'Confraternização Universal (New Year''s Day)', 'closed', null, null, ''),
  ('br', '2027-02-08', 'Carnaval (Monday)', 'closed', null, null, 'Ponto facultativo — optional federal day'),
  ('br', '2027-02-09', 'Carnaval (Tuesday)', 'closed', null, null, 'Ponto facultativo — optional federal day'),
  ('br', '2027-03-26', 'Sexta-feira Santa (Good Friday)', 'closed', null, null, ''),
  ('br', '2027-04-21', 'Tiradentes', 'closed', null, null, ''),
  ('br', '2027-05-01', 'Dia do Trabalho (Labour Day)', 'closed', null, null, ''),
  ('br', '2027-05-27', 'Corpus Christi', 'closed', null, null, 'Ponto facultativo — optional federal day'),
  ('br', '2027-09-07', 'Independência do Brasil', 'closed', null, null, ''),
  ('br', '2027-10-12', 'Nossa Senhora Aparecida', 'closed', null, null, ''),
  ('br', '2027-11-02', 'Finados', 'closed', null, null, ''),
  ('br', '2027-11-15', 'Proclamação da República', 'closed', null, null, ''),
  ('br', '2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'closed', null, null, ''),
  ('br', '2027-12-25', 'Natal (Christmas Day)', 'closed', null, null, '')
on conflict (calendar, day) do nothing;

commit;

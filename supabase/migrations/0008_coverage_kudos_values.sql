-- Who covers for someone while they're out, and the company value a kudo recognizes.

begin;

-- people.id of the colleagues taking over while the person is out.
alter table public.absences
  add column if not exists covered_by uuid[] not null default '{}';

alter table public.kudos
  add column if not exists category text
  check (category in ('teamwork', 'innovation', 'agility', 'ownership', 'customer', 'sustainability'));

commit;

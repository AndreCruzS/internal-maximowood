-- Org chart: seniority levels and safe "reports to".
--  • positions.level (1 partner/C-level … 6 intern). Null = read from the job title in the app.
--    Only admins set it; people editing their own entry can't change it.
--  • "Reports to" can't make a loop (someone reporting to their own report).

begin;

alter table public.positions add column if not exists level smallint check (level between 1 and 6);

create or replace function public.positions_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.is_admin(), false) then
    new.level := case when tg_op = 'UPDATE' then old.level else null end;
  end if;
  if new.reports_to is not null and exists (
    with recursive up(id, reports_to) as (
      select id, reports_to from public.positions where id = new.reports_to
      union
      select p.id, p.reports_to from public.positions p join up on p.id = up.reports_to
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'A position can''t report to someone who reports to it';
  end if;
  return new;
end $$;
drop trigger if exists positions_guard on public.positions;
create trigger positions_guard before insert or update on public.positions
  for each row execute function public.positions_guard();

commit;

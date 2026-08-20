-- Keep users.updatedAt aligned with the MySQL ON UPDATE CURRENT_TIMESTAMP behavior.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;

create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

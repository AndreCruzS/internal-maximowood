-- Builder Express joins the group's brands (email domain to be added when known).
insert into public.companies (id, name, sort) values ('builderexpress', 'Builder Express', 4) on conflict (id) do nothing;

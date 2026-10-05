-- Fix the three `rls_disabled_in_public` linter ERRORs: public.users,
-- public.inventory and the inventory sync log are reachable through PostgREST
-- with the anon key, so without RLS anyone holding NEXT_PUBLIC_SUPABASE_ANON_KEY
-- (it ships in the browser bundle) can read them.
--
-- Deny-by-default is the whole fix here: nothing in the app queries these
-- tables with the anon or authenticated key.
--   * public.users     — dead table left over from the MySQL/Drizzle port;
--                        sign-in and admin user management use auth.users via
--                        `supabase.auth.admin.*` (src/lib/supabase/admin.ts).
--   * public.inventory — written only by the nightly sync
--     + the sync log     (src/server/inventorySync.ts) with
--                        SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. The
--                        Inventory tab reads another project's view instead.
-- RLS enabled with zero policies therefore locks out anon/authenticated and
-- leaves the cron sync working. Add a policy if a table gains a real reader.
--
-- The sync log is `inventory_sync_log` in the live database but
-- `inventorySyncLog` in 0001; whichever name is present gets locked down.

begin;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in ('users', 'inventory', 'inventory_sync_log', 'inventorySyncLog')
  loop
    execute format('alter table public.%I enable row level security', t);
    -- Defense in depth: drop the table-level grants PostgREST's roles would
    -- otherwise still carry, so a future permissive policy cannot silently
    -- re-expose these tables.
    execute format('revoke all on public.%I from anon, authenticated', t);
    raise notice 'RLS enabled and anon/authenticated grants revoked on public.%', t;
  end loop;
end $$;

commit;

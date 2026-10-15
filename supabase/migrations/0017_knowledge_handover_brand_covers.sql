-- Knowledge page, offboarding handover and brand covers.
--  * Knowledge: pills, upcoming PKs (live sessions), videos, studies and industry
--    insights in one table; anyone can request a session. Leaders, HR and admins
--    publish and handle the requests.
--  * Handover: the person leaving (or their leader / HR) answers what they handle,
--    the key accounts, what stays open, what will be delivered in time and who
--    takes over. IT, the leaders, the person leaving and the successor can read it.
--  * Profile covers default to the person's brand colors ("brands").

begin;

-- ── Brand covers ─────────────────────────────────────────────────────────────
-- Nobody picked a cover before this: 'forest' was only the default.
alter table public.people alter column cover set default 'brands';
update public.people set cover = 'brands' where cover = 'forest';

-- ── Knowledge ────────────────────────────────────────────────────────────────
create or replace function public.can_edit_knowledge() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin() or public.my_role() = 'leader' or public.in_department('hr'), false)
$$;

create table public.knowledge_items (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('pill', 'session', 'video', 'study', 'insight')),
  title         text not null check (length(btrim(title)) between 1 and 200),
  summary       text not null default '' check (length(summary) <= 4000),
  url           text check (url is null or url ~* '^https?://'),
  event_at      timestamptz,
  presenter_id  uuid references public.people (id) on delete set null,
  department_id text references public.departments (id) on delete set null,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind <> 'session' or event_at is not null)
);
create index knowledge_items_kind_idx on public.knowledge_items (kind, created_at desc);
create trigger knowledge_items_updated_at before update on public.knowledge_items for each row execute function public.set_updated_at();

alter table public.knowledge_items enable row level security;
grant select, insert, update, delete on public.knowledge_items to authenticated;
create policy "read knowledge" on public.knowledge_items for select to authenticated using (true);
create policy "publish knowledge" on public.knowledge_items for insert to authenticated
  with check (public.can_edit_knowledge() and created_by = auth.uid());
create policy "edit knowledge" on public.knowledge_items for update to authenticated
  using (public.is_admin() or (public.can_edit_knowledge() and created_by = auth.uid()))
  with check (public.is_admin() or (public.can_edit_knowledge() and created_by = auth.uid()));
create policy "delete knowledge" on public.knowledge_items for delete to authenticated
  using (public.is_admin() or (public.can_edit_knowledge() and created_by = auth.uid()));

create table public.knowledge_requests (
  id           uuid primary key default gen_random_uuid(),
  topic        text not null check (length(btrim(topic)) between 1 and 200),
  details      text not null default '' check (length(details) <= 2000),
  status       text not null default 'open' check (status in ('open', 'planned', 'done', 'declined')),
  requested_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index knowledge_requests_status_idx on public.knowledge_requests (status, created_at desc);

alter table public.knowledge_requests enable row level security;
grant select, insert, update, delete on public.knowledge_requests to authenticated;
create policy "see requests" on public.knowledge_requests for select to authenticated
  using (requested_by = auth.uid() or public.can_edit_knowledge());
create policy "request a session" on public.knowledge_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'open');
create policy "handle requests" on public.knowledge_requests for update to authenticated
  using (public.can_edit_knowledge()) with check (public.can_edit_knowledge());
create policy "withdraw request" on public.knowledge_requests for delete to authenticated
  using ((requested_by = auth.uid() and status = 'open') or public.is_admin());

-- ── Offboarding handover ─────────────────────────────────────────────────────
alter table public.offboardings
  add column if not exists handover     jsonb not null default '{}'::jsonb,
  add column if not exists successor_id uuid references public.people (id) on delete set null,
  add column if not exists handover_at  timestamptz,
  add column if not exists handover_by  uuid references auth.users (id) on delete set null;

-- The person leaving, or a leader / HR / admin, while the offboarding is open.
create or replace function public.save_handover(offboarding uuid, answers jsonb, successor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o public.offboardings;
  clean jsonb := '{}'::jsonb;
  k text;
begin
  select * into o from public.offboardings where id = offboarding and status = 'requested';
  if o.id is null then raise exception 'This offboarding is not open'; end if;
  -- coalesce: the helpers can return null for members, and "not null" would let them through.
  if not coalesce(public.can_add_hires() or o.person_id = public.my_person_id(), false) then
    raise exception 'Only the person leaving, their leader or HR can fill the handover';
  end if;
  if successor = o.person_id then raise exception 'The successor must be someone else'; end if;
  foreach k in array array['projects', 'accounts', 'open', 'delivered'] loop
    if length(coalesce(answers ->> k, '')) > 4000 then raise exception 'Answer too long: %', k; end if;
    clean := clean || jsonb_build_object(k, btrim(coalesce(answers ->> k, '')));
  end loop;
  update public.offboardings
     set handover = clean, successor_id = successor, handover_at = now(), handover_by = auth.uid()
   where id = o.id;
end;
$$;
revoke execute on function public.save_handover(uuid, jsonb, uuid) from anon;

-- What the viewer may see without the offboarding list: their own open
-- offboarding (to fill it) and the handovers where they take over.
create or replace function public.my_handovers()
returns table (id uuid, person_id uuid, last_day date, status text, handover jsonb, successor_id uuid, handover_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.person_id, o.last_day, o.status, o.handover, o.successor_id, o.handover_at,
         o.person_id = public.my_person_id()
    from public.offboardings o
   where public.my_person_id() is not null
     and ((o.person_id = public.my_person_id() and o.status = 'requested')
       or (o.successor_id = public.my_person_id() and o.status <> 'cancelled'))
   order by o.last_day
$$;
revoke execute on function public.my_handovers() from anon;

commit;

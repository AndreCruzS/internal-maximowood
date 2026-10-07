-- Brand pages: websites, landing pages, social media and contact details per
-- brand (one row of brand_pages per company, many brand_links). Read by
-- everyone signed in; edited by admins and the Marketing department leader.

begin;

create table public.brand_pages (
  company_id text primary key references public.companies (id) on delete cascade,
  tagline    text not null default '',
  about      text not null default '',
  updated_at timestamptz not null default now()
);

create table public.brand_links (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id) on delete cascade,
  kind       text not null check (kind in ('website', 'landing', 'social', 'phone', 'email', 'address', 'hours', 'other')),
  -- social: instagram | facebook | linkedin | youtube | tiktok | pinterest | x | whatsapp
  platform   text,
  label      text not null default '',
  -- URL for website/landing/social/other; the number/address/text otherwise.
  value      text not null check (length(btrim(value)) > 0),
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_links_company_idx on public.brand_links (company_id, kind, sort);

create trigger brand_pages_updated_at before update on public.brand_pages for each row execute function public.set_updated_at();
create trigger brand_links_updated_at before update on public.brand_links for each row execute function public.set_updated_at();

alter table public.brand_pages enable row level security;
alter table public.brand_links enable row level security;
grant select, insert, update, delete on public.brand_pages, public.brand_links to authenticated;

create policy "read brand pages"   on public.brand_pages for select to authenticated using (true);
create policy "read brand links"   on public.brand_links for select to authenticated using (true);
create policy "manage brand pages" on public.brand_pages for all to authenticated
  using (public.can_manage('marketing')) with check (public.can_manage('marketing'));
create policy "manage brand links" on public.brand_links for all to authenticated
  using (public.can_manage('marketing')) with check (public.can_manage('marketing'));

-- Seed: what the brands' public websites list (read 2026-10-07).
insert into public.brand_pages (company_id) values ('gmx'), ('maximo'), ('lumberplus'), ('us4pro'), ('builderexpress');

insert into public.brand_links (company_id, kind, platform, label, value, sort) values
  -- GMX Group
  ('gmx', 'website', null, 'GMX Group', 'https://gmxgroup.com/', 0),
  ('gmx', 'phone',   null, 'Phone', '(888) 432-2559', 0),
  ('gmx', 'email',   null, 'Email', 'info@gmxgroup.com', 0),
  ('gmx', 'address', null, 'North American HQ', '20807 Biscayne Boulevard, Suite 304, Aventura, FL 33180, United States', 0),
  ('gmx', 'address', null, 'South American HQ', 'Al. Dr. Carlos de Carvalho, 603 - Suite 31, Curitiba, PR 80430-180, Brazil', 1),
  ('gmx', 'other',   null, 'Norx', 'https://norx.us/', 0),
  ('gmx', 'other',   null, 'Black Label Wood', 'https://blacklabelwood.com/', 1),
  ('gmx', 'other',   null, 'Thermowood', 'https://thermowood.com/', 2),
  -- Maximo
  ('maximo', 'website', null, 'Maximo Wood', 'https://maximowood.com/', 0),
  ('maximo', 'website', null, 'Thermo products', 'https://maximowood.com/thermo', 1),
  ('maximo', 'website', null, 'Dealer locator', 'https://maximowood.com/locate-dealer', 2),
  ('maximo', 'website', null, 'All projects', 'https://maximowood.com/all-projects', 3),
  ('maximo', 'website', null, 'Project gallery', 'https://photos.maximowood.com/', 4),
  ('maximo', 'landing', null, 'BurnBlock', 'https://lp.maximowood.com/burnblock/', 0),
  ('maximo', 'landing', null, 'Talk to a specialist', 'https://api.maximowood.com/talktospecialist/', 1),
  ('maximo', 'other',   null, 'Pre-Finished catalog 2026 (PDF)', 'https://api.maximowood.com/wp-content/uploads/2025/12/121225_WEB_MAXIMO-PRE-FINISHED_2026-CATALOG_v12_FL.pdf', 0),
  -- Lumber Plus
  ('lumberplus', 'website', null, 'Lumber Plus', 'https://www.lumberplus.com/', 0),
  ('lumberplus', 'website', null, 'Catalog', 'https://lumberplus.com/catalog', 1),
  ('lumberplus', 'website', null, 'Service areas', 'https://lumberplus.com/service-areas', 2),
  ('lumberplus', 'website', null, 'Decking calculator', 'https://lumberplus.com/decking-calculator', 3),
  ('lumberplus', 'website', null, 'Blog', 'https://lumberplus.com/blog', 4),
  ('lumberplus', 'landing', null, 'Contact / quote', 'https://lumberplus.com/contact-us', 0),
  ('lumberplus', 'social', 'instagram', 'Instagram', 'https://www.instagram.com/lumberplus', 0),
  ('lumberplus', 'social', 'facebook',  'Facebook',  'https://www.facebook.com/lumberplus', 1),
  ('lumberplus', 'social', 'linkedin',  'LinkedIn',  'https://www.linkedin.com/company/lumberplus', 2),
  ('lumberplus', 'social', 'youtube',   'YouTube',   'https://www.youtube.com/@lumberplus', 3),
  ('lumberplus', 'phone', null, 'Miami, FL', '(786) 206-8899', 0),
  ('lumberplus', 'phone', null, 'Tampa, FL', '(813) 768-1811', 1),
  ('lumberplus', 'phone', null, 'Palm Beach, FL', '(561) 467-5539', 2),
  ('lumberplus', 'phone', null, 'South Dade, FL', '(305) 514-0859', 3),
  ('lumberplus', 'phone', null, 'Houston, TX', '(281) 915-0770', 4),
  ('lumberplus', 'phone', null, 'Boston, MA', '(508) 565-8494', 5),
  ('lumberplus', 'phone', null, 'Nantucket, MA', '(774) 236-9644', 6),
  ('lumberplus', 'phone', null, 'New York, NY', '(934) 949-2639', 7),
  ('lumberplus', 'phone', null, 'Dominican Republic', '(849) 512-4025', 8),
  ('lumberplus', 'address', null, 'Miami', '255 NE 181st St, Miami, FL 33162', 0),
  ('lumberplus', 'address', null, 'Tampa', '12745 49th St N, Clearwater, FL 33762', 1),
  ('lumberplus', 'address', null, 'Houston', '10040 FM 1960 Rd W, Houston, TX 77070', 2),
  ('lumberplus', 'hours', null, 'Miami', 'Mon–Fri 8am–5pm · Sat 8:30am–12:30pm', 0),
  -- US4
  ('us4pro', 'website', null, 'US4', 'https://us4pro.com/', 0),
  -- Builder Express
  ('builderexpress', 'website', null, 'Builder Express', 'https://builderexpress.com/', 0),
  ('builderexpress', 'website', null, 'Deck builder', 'https://builderexpress.com/deck-builder', 1),
  ('builderexpress', 'website', null, 'Wall builder', 'https://builderexpress.com/wall-builder', 2),
  ('builderexpress', 'website', null, 'Ceiling builder', 'https://builderexpress.com/ceiling-builder', 3),
  ('builderexpress', 'website', null, 'Find a contractor', 'https://builderexpress.com/contractors', 4),
  ('builderexpress', 'landing', null, 'Trade portal', 'https://partner-production-a77b.up.railway.app/login', 0),
  ('builderexpress', 'phone', null, 'Phone', '(904) 914-7035', 0);

commit;

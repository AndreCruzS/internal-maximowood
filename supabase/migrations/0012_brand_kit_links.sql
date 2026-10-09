-- Brand pages fill themselves from what departments tag with a brand. Logos,
-- fonts and brand guidelines are documents of the new kind "brand_kit" (usually
-- added by Marketing on their department page) and show in the brand's kit.

begin;

alter table public.links drop constraint if exists links_kind_check;
alter table public.links add constraint links_kind_check
  check (kind in ('web_app', 'doc', 'sheet', 'slides', 'pdf', 'folder', 'form', 'video', 'brand_kit', 'other'));

commit;

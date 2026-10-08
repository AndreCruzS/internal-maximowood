-- A more personal profile: languages spoken, office, birthday (day + month
-- only — no year, so ages aren't shown) and company start date (anniversaries).
-- Each person edits their own (policy "edit own person" from 0003).

alter table public.people
  add column if not exists languages   text[] not null default '{}',
  add column if not exists office      text check (office in ('curitiba', 'aventura', 'lumberplus-miami', 'remote')),
  add column if not exists birth_month smallint check (birth_month between 1 and 12),
  add column if not exists birth_day   smallint check (birth_day between 1 and 31),
  add column if not exists start_date  date check (start_date >= date '1990-01-01'),
  add constraint people_birthday_complete check ((birth_month is null) = (birth_day is null));

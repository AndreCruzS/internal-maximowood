-- Lead time on saved quotes: the weeks the salesperson picks in the quote
-- dialog, printed in the PDF terms as "Lead Time: Up to N weeks".
-- Nullable so quotes saved before this column keep loading.

alter table public.quotes
  add column if not exists lead_time_weeks smallint
  check (lead_time_weeks between 1 and 52);

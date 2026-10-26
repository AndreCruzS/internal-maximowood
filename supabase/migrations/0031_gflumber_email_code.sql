-- Global LBM (gflumber.com) people sign in with an emailed code: their mail is on Microsoft 365,
-- not Google Workspace. The code and the login come from Supabase (admin generateLink); the
-- intranet emails it itself, so the shared project's auth settings are not touched.
--   * gflumber.com may have an account and belongs to Global LBM (added in 0007).
--   * email_log gets the 'login_code' kind, used to limit how often codes are sent.
--     The code itself is never stored.

begin;

insert into public.allowed_email_domains (domain, company_id) values ('gflumber.com', 'globallbm')
on conflict (domain) do update set company_id = excluded.company_id;

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('new_hire', 'offboarding', 'travel_submitted', 'travel_status', 'referral_submitted', 'referral_status',
                  'time_off_request', 'time_off_decision',
                  'vendor_submitted', 'vendor_approval', 'vendor_decision', 'vendor_registered',
                  'vendor_review_due', 'vendor_suspended',
                  'login_code'));
create index if not exists email_log_login_code_idx on public.email_log (to_email, created_at desc) where kind = 'login_code';

notify pgrst, 'reload schema';

commit;

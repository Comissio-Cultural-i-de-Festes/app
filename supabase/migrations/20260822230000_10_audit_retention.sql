-- Retention for the audit trail.
--
-- audit_log exists to answer "who made them an admin?", "who approved this
-- person?" and "who marked that as paid?" — questions that only ever come up
-- when something has gone wrong, and that are unanswerable a year later
-- otherwise, because the junta rotates every course.
--
-- TWENTY-FOUR MONTHS. That is two full academic years, which is enough for the
-- outgoing junta and the one after it to be asked about a decision, and short
-- enough that the trail is not an indefinite record of who did what to whom.
-- Keeping personal data no longer than necessary is the rule; a purge that
-- actually runs is what turns that from a sentence into a fact.
--
-- What this does NOT purge: points_log. That is the ledger the ranking is
-- built from, it is append-only, and losing it would silently rewrite two
-- years of standings.

-- ENABLE pg_cron IN THE DASHBOARD BEFORE PUSHING THIS.
--
-- Database > Extensions > pg_cron. Then this becomes a no-op and everything
-- lines up. Creating it from a migration on a hosted project is known to leave
-- the schema grants half-set even though the dashboard reports it active, and
-- the fix for that is to toggle it off and on in the dashboard anyway.
--
-- pg_catalog, not extensions: that is the schema Supabase documents for this
-- one, and it is where it lands locally too.
do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
exception
  when insufficient_privilege or feature_not_supported then
    raise exception
      'pg_cron is not enabled on this project. Turn it on in Dashboard > '
      'Database > Extensions and push again. Do not skip this migration: '
      'without the scheduled purge, audit_log keeps personal data for ever '
      'and the 24-month retention policy is only a comment.'
      using errcode = '0A000';
end $$;

create or replace function private.purge_audit_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.audit_log
   where created_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function private.purge_audit_log() from public, anon, authenticated;

comment on function private.purge_audit_log is
  'Deletes audit rows older than 24 months. Scheduled nightly by pg_cron. '
  'Callable by nobody but the scheduler and the owner — it is not something '
  'an admin should be able to trigger, since the point of a trail is that the '
  'people in it cannot clear it.';

-- Nightly, at an hour when nobody is at an event. `cron.schedule` replaces a
-- job with the same name, so re-running this migration does not stack them up.
select cron.schedule(
  'purge-audit-log',
  '30 4 * * *',
  $$ select private.purge_audit_log() $$
);

comment on table public.audit_log is
  'Who changed a role, who approved a member, who marked money as paid. '
  'Admin-readable only: a member does not see their own rows in the app, '
  'because the trail is about the committee''s actions rather than about them, '
  'and showing half of it would be more misleading than showing none. That is '
  'a UI decision and not a legal one — a subject access request still has to '
  'be answered, and the README says how. Purged after 24 months by '
  'private.purge_audit_log().';

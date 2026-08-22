-- Bootstrap: extensions, the private schema, and closing Supabase's default
-- privileges.
--
-- The revokes below have to run BEFORE any table exists. Supabase ships
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated`, so every `create table` in `public` arrives with ALL granted
-- to both roles before a single policy is written. Without this, everything
-- that follows is decoration.
--
-- Caveats, stated plainly:
--   * ALTER DEFAULT PRIVILEGES only affects objects created by the role that
--     issued it. Supabase also defines defaults FOR ROLE supabase_admin, which
--     `postgres` may not be able to alter on a hosted project. Check with
--     `select * from pg_default_acl;` if something looks too open.
--   * It is global and persistent: a table made later through the dashboard
--     will also arrive with no anon/authenticated grants. That is the right
--     default, but it will surprise somebody.
-- Because of both, 03_grants.sql still writes an explicit revoke per table.
-- This is the safety net, not the mechanism.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- deliberately not granted to anon: an unauthenticated caller has no role to
-- check and nothing in here to ask about.

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Never revoke from service_role: it is the backend's identity.

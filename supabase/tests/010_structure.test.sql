-- Structural invariants.
--
-- These assert things that have no observable behaviour through the API until
-- the day they do. A table with beautiful policies and RLS never switched on
-- looks identical from a client if the client happens to be an admin; a view
-- that forgot security_invoker returns exactly the rows the tests expect, and
-- also returns them for tables the caller cannot read.

begin;
select plan(9);

select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table in public has row level security enabled'
);

select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'every table in public has at least one policy'
);

-- The two ranking views are definer on purpose: they publish aggregates over a
-- ledger no client may read row by row. They are the only two allowed to be,
-- and the Supabase advisor should report exactly these.
select set_eq(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and coalesce(
              (select option_value from pg_options_to_table(c.reloptions)
                where option_name = 'security_invoker'), 'false') <> 'true' $$,
  array['ranking', 'ranking_escoles'],
  'only the two ranking views are security definer'
);

-- Without this, the caller's search_path decides which `profiles` a definer
-- function reads, which is a privilege-escalation primitive. Postgres stores
-- `set search_path = ''` as the literal string search_path="".
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prosecdef
        and not coalesce(p.proconfig, '{}') @> array['search_path=""'] $$,
  'every security definer function pins an empty search_path'
);

-- Postgres grants EXECUTE to PUBLIC on new functions all by itself, so this
-- one drifts open silently every time somebody adds an RPC.
select set_eq(
  $$ select p.proname::text
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'execute') $$,
  array['invite_preview'],
  'invite_preview is the only function anon may execute'
);

-- Load-bearing for the entire check-in design: this index, not the application
-- code, is what makes a resent offline queue harmless.
select is(
  (select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'points_log_asistencia_unic'),
  'CREATE UNIQUE INDEX points_log_asistencia_unic ON public.points_log '
    || 'USING btree (user_id, event_id) WHERE (motivo = ''asistencia''::text)',
  'the attendance award index is unique, partial, and exactly as designed'
);

select is(
  (select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'points_log_client_request_id_key'),
  'CREATE UNIQUE INDEX points_log_client_request_id_key ON public.points_log '
    || 'USING btree (client_request_id) WHERE (client_request_id IS NOT NULL)',
  'the idempotency key index is unique and partial'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendances'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
          where attrelid = 'public.attendances'::regclass and attname = 'user_id'),
        (select attnum from pg_attribute
          where attrelid = 'public.attendances'::regclass and attname = 'event_id')
      ]::smallint[]
  ),
  'attendances is unique on (user_id, event_id)'
);

-- A profile arriving as 'actiu' would make the whole invitation gate
-- decorative: Supabase Auth will mail a link to any address that asks.
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'estat'),
  '''pendent''::text',
  'a new profile starts pendent, so the invite gate actually gates'
);

select * from finish();
rollback;

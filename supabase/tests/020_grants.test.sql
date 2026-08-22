-- Privileges.
--
-- Column grants are checked before RLS runs, so this file covers the strongest
-- controls in the schema — the ones a policy bug cannot open. They are also
-- the ones that decay silently: a column added next term is writable unless
-- somebody remembers, and nothing in the app's behaviour changes until it is
-- abused.

begin;
select plan(25);

-- ── points_log is unreachable from a client ─────────────────────────────────
select ok(
  not has_table_privilege('authenticated', 'public.points_log', 'INSERT'),
  'authenticated cannot insert into points_log'
);
select ok(
  not has_table_privilege('authenticated', 'public.points_log', 'UPDATE'),
  'authenticated cannot update points_log'
);
select ok(
  not has_table_privilege('authenticated', 'public.points_log', 'DELETE'),
  'authenticated cannot delete from points_log'
);
select ok(
  has_table_privilege('authenticated', 'public.points_log', 'SELECT'),
  'authenticated can still read the ledger rows its policy allows'
);
select ok(
  not has_table_privilege('anon', 'public.points_log', 'SELECT'),
  'anon cannot read points_log'
);

-- ── the profile columns that decide who you are ─────────────────────────────
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  'authenticated cannot write profiles.role'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'estat', 'UPDATE'),
  'authenticated cannot write profiles.estat'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'nombre', 'UPDATE'),
  'a member can still edit their own name'
);

-- ── profiles is ordinary, and that is the design ────────────────────────────
-- The check-in credential and the phone number are not here any more, so
-- reading the whole row is safe and `select('*')` works. Protecting them with
-- a column-level revoke also worked, but it made `*` fail, which left the
-- guarantee resting on every future contributor choosing to enumerate columns
-- instead of handing the grant back.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('qr_token', 'telefon')
  ),
  'profiles holds nothing that needs hiding from the association'
);

select is_empty(
  $$ select column_name::text
       from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'profiles'
        and not has_column_privilege('authenticated', 'public.profiles',
                                     c.column_name, 'SELECT') $$,
  'so every column of profiles is readable and select(*) does not fail'
);

-- ── profile_secret is write-proof ───────────────────────────────────────────
select ok(
  not has_table_privilege('authenticated', 'public.profile_secret', 'INSERT'),
  'no client inserts a QR token'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_secret', 'UPDATE'),
  'nor rewrites one: rotation goes through rotate_qr_token()'
);
select ok(
  not has_table_privilege('authenticated', 'public.profile_secret', 'DELETE'),
  'nor deletes one'
);

-- The junta has no policy on this table at all. An admin never needs to see a
-- token, and an admin account being compromised must not hand over everyone's.
select is_empty(
  $$ select polname::text from pg_policy
      where polrelid = 'public.profile_secret'::regclass
        and polname <> 'psecret_select_self' $$,
  'and the only policy on it is the own-row read'
);

-- ── attendances: checking yourself in is the valuable bypass ────────────────
select ok(
  not has_column_privilege('authenticated', 'public.attendances', 'checked_in_at', 'UPDATE'),
  'authenticated cannot write attendances.checked_in_at'
);
select ok(
  not has_column_privilege('authenticated', 'public.attendances', 'pagado', 'UPDATE'),
  'authenticated cannot mark itself as paid'
);
select ok(
  not has_column_privilege('authenticated', 'public.attendances', 'was_registered', 'UPDATE'),
  'authenticated cannot rewrite whether it was signed up'
);
select ok(
  has_column_privilege('authenticated', 'public.attendances', 'estado', 'UPDATE'),
  'a member can still change their own answer'
);

-- ── ride seats go through join_ride, which locks the ride row ───────────────
select ok(
  not has_table_privilege('authenticated', 'public.ride_seats', 'INSERT'),
  'seats are not inserted directly: a WITH CHECK cannot count concurrent rows'
);

-- ── proposals: the tally is not writable ────────────────────────────────────
select ok(
  not has_column_privilege('authenticated', 'public.proposals', 'vots', 'UPDATE'),
  'nobody can inflate their own proposal up the list'
);
select ok(
  not has_column_privilege('authenticated', 'public.proposals', 'estat', 'UPDATE'),
  'accepting a proposal is the junta''s call, through an RPC'
);

-- ── anon has nothing ────────────────────────────────────────────────────────
select is_empty(
  $$ select table_name::text
       from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon' $$,
  'anon holds no privilege on any table or view in public'
);

select is_empty(
  $$ select table_name::text || '.' || column_name::text
       from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'anon' $$,
  'anon holds no column privilege in public either'
);

-- ── service_role keeps working ──────────────────────────────────────────────
-- Not inherited. On this CLI version the postgres role's default privileges
-- for schema public give service_role only Dxtm, so a table added by a future
-- migration is invisible to the backend until it is granted. The symptom is a
-- flat 403 from PostgREST with nothing to point at, so it is asserted here.
select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not (has_table_privilege('service_role', c.oid, 'SELECT')
                 and has_table_privilege('service_role', c.oid, 'INSERT')
                 and has_table_privilege('service_role', c.oid, 'UPDATE')
                 and has_table_privilege('service_role', c.oid, 'DELETE')) $$,
  'service_role can read and write every table in public'
);

select is_empty(
  $$ select c.relname::text
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not has_table_privilege('service_role', c.oid, 'SELECT') $$,
  'and read every view'
);

select * from finish();
rollback;

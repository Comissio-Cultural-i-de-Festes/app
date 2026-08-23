-- The door token, and the two ways it used to fail silently.
--
-- It returned NULL for a profile that was not active and NULL for a missing
-- profile_secret row. A NULL over the wire is indistinguishable from a request
-- that never arrived, so both of them reached the member as "try again with a
-- connection" — which is wrong advice for the first and impossible advice for
-- the second.

begin;
select plan(7);

reset role;

-- ── the ordinary case ───────────────────────────────────────────────────────
-- Read as the session user first: tests.* is revoked from `authenticated`.
create temporary table expected as select tests.qr('alfa') as token;
grant select on expected to authenticated;

select tests.authenticate_as('alfa');

select isnt(
  (select public.my_qr()),
  null,
  'an active member gets their token'
);

select is(
  (select public.my_qr()),
  (select token from expected),
  'and it is the one the door will resolve, not a fresh one each call'
);

-- ── not approved yet ────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('pendent_alfa');

select throws_ok(
  $$ select public.my_qr() $$,
  'P0001',
  'perfil no actiu: pendent',
  'somebody still waiting to be approved is told so, and not told to check '
  'their signal'
);

reset role;
select tests.authenticate_as('baixa_alfa');

select throws_ok(
  $$ select public.my_qr() $$,
  'P0001',
  'perfil no actiu: baixa',
  'and so is somebody who has left'
);

-- ── a missing secret is no longer a dead end ────────────────────────────────
-- An account created before the trigger existed, or while it was inert, had
-- no row here and no way to ever get one.
reset role;
delete from public.profile_secret where id = tests.uid('alfa');

select tests.authenticate_as('alfa');

select isnt(
  (select public.my_qr()),
  null,
  'a member whose secret row went missing gets one minted rather than nothing'
);

reset role;
select is(
  (select count(*)::int from public.profile_secret where id = tests.uid('alfa')),
  1,
  'and the row is really there afterwards'
);

-- ── a stranger ──────────────────────────────────────────────────────────────
select tests.authenticate_as_anon();

select throws_ok(
  $$ select public.my_qr() $$,
  '42501',
  null,
  'and nobody without a session gets a token'
);

select * from finish();
rollback;

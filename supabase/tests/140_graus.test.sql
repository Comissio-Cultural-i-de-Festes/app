-- The list of degrees.
--
-- Two things worth pinning. It has to be readable by somebody who is still
-- PENDING, because the screen that reads it is the one you see before the
-- junta has approved you — a list that comes back empty there leaves the
-- picker blank and the person typing again. And it must not be writable by a
-- member, because it is shown to everybody and nobody but the junta should be
-- able to put words on that screen.

begin;
select plan(8);

reset role;

-- ── reading ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select isnt_empty(
  $$ select nom from public.graus where escola = 'politecnica' $$,
  'an active member can read the list'
);

reset role;
select tests.authenticate_as('pendent_alfa');

select isnt_empty(
  $$ select nom from public.graus where escola = 'salut' $$,
  'and so can somebody still waiting to be approved, which is who needs it'
);

reset role;
select tests.authenticate_as_anon();

-- Refused rather than empty: the grant is revoked from anon, and privileges
-- are checked before policies ever run.
select throws_ok(
  $$ select nom from public.graus $$,
  '42501',
  null,
  'a stranger is refused outright'
);

-- ── writing ─────────────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  $$ insert into public.graus (escola, nom) values ('salut', 'Grau inventat') $$,
  '42501',
  null,
  'a member cannot add a degree'
);

-- This used to run without error and change nothing, because a policy's USING
-- clause filters rather than raises. Since migration 26 nobody holds the write
-- grant at all, and privileges are checked before RLS — so it raises now, and
-- for a stronger reason than the one it used to pass for.
select throws_ok(
  $$ update public.graus set nom = 'Tocat' where escola = 'salut' $$,
  '42501',
  null,
  'and cannot edit one either, stopped by the grant rather than the policy'
);

reset role;
select is_empty(
  $$ select 1 from public.graus where nom = 'Tocat' $$,
  'and it changed nothing, which is the half that has to be asserted'
);

-- ── the junta ───────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_save_grau('empresa', 'Un grau nou del curs que ve', 99) $$,
  'the junta can add one when the university opens it, without a deploy'
);

reset role;
select is(
  (select escola from public.graus where nom = 'Un grau nou del curs que ve'),
  'empresa',
  'and it lands under the school it was filed under'
);

select * from finish();
rollback;

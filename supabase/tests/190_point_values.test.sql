-- The points scale, and the row it must refuse to invent.
--
-- The refusal is the assertion worth having. A `clau` that is not already in
-- this table is also missing from a CHECK constraint and from an allowlist
-- inside award_points, so a row on its own would be a button that exists,
-- looks right, and fails at the moment somebody presses it in front of a
-- queue. The prototype already made that mistake once with "conduir".

begin;
select plan(12);

reset role;
delete from public.audit_log;

-- ── who may ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_set_point_value('motiu', 'montaje', 5) $$,
  '42501',
  'nomes junta',
  'a member cannot change what an evening is worth'
);

select throws_ok(
  $$ update public.point_values set punts = 500 where clau = 'montaje' $$,
  '42501',
  null,
  'and cannot reach the table directly, which is what the revoke is for'
);

reset role;
select ok(
  not has_table_privilege('authenticated', 'public.point_values', 'UPDATE'),
  'no write grant left: privileges are checked before RLS, so this is the lock'
);

select ok(
  has_table_privilege('authenticated', 'public.point_values', 'SELECT'),
  'reading stays, because the awarding screen draws its buttons from it'
);

-- ── the junta ───────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_set_point_value('motiu', 'montaje', 35) $$,
  'the junta can settle the scale after the first month, as the brief asks'
);

reset role;
select is(
  (select punts from public.point_values where mena = 'motiu' and clau = 'montaje'),
  35,
  'and the number is the one that was sent'
);

select is(
  (select ordre from public.point_values where mena = 'motiu' and clau = 'montaje'),
  1,
  'with the order left alone, because nothing was said about it'
);

select tests.authenticate_as('junta_alfa');
select public.admin_set_point_value('motiu', 'montaje', 35, 4);

reset role;
select is(
  (select ordre from public.point_values where mena = 'motiu' and clau = 'montaje'),
  4,
  'and moved when something was'
);

select is(
  (select detall->>'abans' || '→' || (detall->>'ara')
     from public.audit_log
    where accio = 'set_point_value'
    order by created_at limit 1),
  '20→35',
  'the trail says what it was worth before, which is the question asked in March'
);

-- ── what it will not do ─────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_set_point_value('motiu', 'ballar', 10) $$,
  'P0002',
  'aquest motiu no existeix',
  'a motive the CHECK constraint has never heard of is refused, not created'
);

reset role;
select is_empty(
  $$ select 1 from public.point_values where clau = 'ballar' $$,
  'and no row appeared, which is the half that would have shipped a dead button'
);

select tests.authenticate_as('junta_alfa');
select throws_ok(
  $$ select public.admin_set_point_value('motiu', 'montaje', 900) $$,
  '22023',
  null,
  'and the range is checked here rather than by a constraint violation'
);

select * from finish();
rollback;

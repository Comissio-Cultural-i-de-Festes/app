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

-- EL RASTRE ES MIRA AQUÍ, amb UNA sola crida feta, i no al final.
--
-- `audit_log.created_at` és `transaction_timestamp()`, o sigui que TOTES les
-- files que escrigui aquest fitxer porten la mateixa marca de temps: el rellotge
-- no avança dins d'una transacció. Amb les dues crides fetes, `order by
-- created_at limit 1` no desempatava res i quina de les dues sortia ho decidia
-- Postgres —es veia com un `have: 35→35`, que és la segona—. No era una base
-- bruta: era aquest fitxer mirant-se dues files seves com si en fossin una.
--
-- I `string_agg` EN COMPTES DE `limit 1`: si algun dia hi tornen a haver dues
-- files, el `have:` les ensenya totes dues en comptes de triar-ne una a l'atzar
-- i passar o caure segons el dia. El `created_at >= transaction_timestamp()`
-- continua deixant fora les files que ja hi havia: desar el barem des de
-- `/junta/barem` també escriu `set_point_value`, i en una base viva aquelles
-- files no se'n van.
select is(
  (select string_agg(detall->>'abans' || '→' || (detall->>'ara'), ', ')
     from public.audit_log
    where accio = 'set_point_value'
      and detall->>'clau' = 'montaje'
      and created_at >= transaction_timestamp()),
  '20→35',
  'the trail says what it was worth before, which is the question asked in March'
);

select tests.authenticate_as('junta_alfa');
select public.admin_set_point_value('motiu', 'montaje', 35, 4);

reset role;
select is(
  (select ordre from public.point_values where mena = 'motiu' and clau = 'montaje'),
  4,
  'and moved when something was'
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

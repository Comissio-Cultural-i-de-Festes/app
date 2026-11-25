-- Qui ve de fora (migració 96): què vol dir la columna, qui la pot escriure i
-- què canvia als rànquings.
--
-- LA TANCA QUE IMPORTA ÉS EL `check`, I S'HI COMPARA EL NOM. El 23514 és
-- qualsevol violació de check de `profiles`, i en té uns quants. Amb el
-- missatge a null, el dia que algú deixés caure `profiles_extern_sense_escola`
-- i l'update petés per una altra raó, la prova seguiria verda. Ho explica més
-- llarg el 450.
--
-- ELS RÀNQUINGS ES COMPAREN AMB ELLS MATEIXOS, no amb un número. La llavor i la
-- suite RLS hi escriuen i no desfan res, així que el que es comprova és que
-- marcar alfa com a extern treu un membre a la seva escola i no treu ningú del
-- rànquing individual.
--
-- Persones inventades, com a tot el repo.

\set extern_check 'new row for relation "profiles" violates check constraint "profiles_extern_sense_escola"'

begin;
select plan(14);

-- ── 1. La columna ───────────────────────────────────────────────────────────

select has_column('public', 'profiles', 'extern', 'profiles te la columna extern');
select col_not_null('public', 'profiles', 'extern', 'i no admet null: o vens de fora o no');
select col_default_is('public', 'profiles', 'extern', 'false',
  'i per defecte no: qui entra encara no ha dit res');

-- ── 2. El que es veu abans ──────────────────────────────────────────────────
--
-- Mirat ja com a alfa: les dues funcions només contesten a un soci actiu, i
-- com a `postgres` tornen buit.

create temp table abans (membres_politecnica int, individual int);
grant select, insert on abans to authenticated;

reset role;
select tests.authenticate_as('alfa');

insert into abans
select
  (select membres from public.ranking_escoles_period(null, null)
    where escola = 'politecnica'),
  (select count(*)::int from public.ranking_period(null, null));

-- ── 3. El soci mateix, al primer cop ────────────────────────────────────────

select throws_ok(
  $$ update public.profiles set extern = true where id = (select auth.uid()) $$,
  '23514', :'extern_check',
  'extern i amb escola alhora: refusat, que l''escola es la que guanyaria'
);

select lives_ok(
  $$ update public.profiles set extern = true, escola = null, grau = null, curs = null
      where id = (select auth.uid()) $$,
  'extern i l''escola buidada a la mateixa sentencia: val'
);

select is(
  (select membres from public.ranking_escoles_period(null, null) where escola = 'politecnica'),
  (select membres_politecnica - 1 from abans),
  'la seva escola te un membre menys'
);

select is(
  (select count(*)::int from public.ranking_period(null, null)),
  (select individual from abans),
  'i el ranquing individual el segueix tenint'
);

select throws_ok(
  $$ update public.profiles set escola = 'salut' where id = (select auth.uid()) $$,
  '23514', :'extern_check',
  'i un extern no es pot posar una escola sense deixar de ser-ho'
);

-- La fila d'un altre: la política la filtra i no peta, o sigui que l'asserció
-- va sobre la fila, no sobre cap codi.
update public.profiles set extern = true, escola = null
 where id = '00000000-0000-4000-8000-000000000002';

select is(
  (select extern from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  false,
  'un soci no pot marcar un altre com a extern'
);

-- ── 4. Un pendent també, que el primer cop es fa abans que la junta l'accepti ─

reset role;
select tests.authenticate_as('pendent_alfa');

select lives_ok(
  $$ update public.profiles set extern = true where id = (select auth.uid()) $$,
  'un pendent sense escola es marca extern al primer cop'
);

-- ── 5. La junta, corregint qui ja s'havia inventat una escola ───────────────

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ update public.profiles set extern = true, escola = null, grau = null, curs = null
      where id = '00000000-0000-4000-8000-000000000002' $$,
  'la junta marca un soci com a extern'
);

select is(
  (select extern from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  true,
  'i la fila ho diu'
);

select lives_ok(
  $$ update public.profiles set extern = false
      where id = '00000000-0000-4000-8000-000000000002' $$,
  'i el desmarca'
);

select is(
  (select escola is null and not extern from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'),
  true,
  'i queda sense escola i sense ser extern, que es el que el torna al primer cop'
);

select * from finish();
rollback;

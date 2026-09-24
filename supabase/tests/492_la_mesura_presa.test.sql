-- La mesura presa d'un avís: s'escriu en crear-lo o després, només la junta, i
-- la llegeix també qui hi surt.
--
-- Tres coses que no es veuen obrint cap pantalla i que es fixen aquí: que un soci
-- no la pot escriure ni amb la RPC ni amb un UPDATE directe —el segon és un
-- grant que falta, i per això s'asserta el grant i no una fila—; que el CHECK de
-- la taula la vol retallada encara que algú se salti la RPC; i que l'auditoria
-- en guarda el fet i no el text.
--
-- Les files es fan aquí dins i es miren per l'id que torna cada crida.

begin;
select plan(14);

reset role;
update public.ranking_periods
   set starts_at = now() - interval '30 days', ends_at = null
 where mena = 'global';

create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;

select tests.authenticate_as('junta_alfa');

insert into fet
select 'amb', public.avisa(
  '00000000-0000-4000-8000-000000000002', 'no_va_venir', 'Prova: no va venir', 0, null, null,
  E'  Reunió el dia 3, es compromet a avisar\t'
);

insert into fet
select 'sense', public.avisa(
  '00000000-0000-4000-8000-000000000002', 'mal_gest', 'Prova: sense mesura'
);

reset role;

select is(
  (select mesura_presa from public.avisos where id = (select id from fet where clau = 'amb')),
  'Reunió el dia 3, es compromet a avisar',
  'avisa() desa la mesura presa, retallada per nota_neta'
);

select is(
  (select mesura_presa from public.avisos where id = (select id from fet where clau = 'sense')),
  null,
  'i sense mesura, null: no n''hi ha cap de presa encara'
);

select is(
  (select detall->>'amb_mesura' from public.audit_log
    where accio = 'avis' and detall->>'avis' = (select id::text from fet where clau = 'amb')),
  'true',
  'l''auditoria d''avisa() diu que en porta una, sense dir quina'
);

-- ── editar-la ──────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.edita_mesura_presa(%L, 'Reunió feta el dia 10') $$,
         (select id from fet where clau = 'sense')),
  'la junta pot posar-la després'
);

select throws_ok(
  format($$ select public.edita_mesura_presa(%L, %L) $$,
         (select id from fet where clau = 'sense'), repeat('x', 501)),
  '22023', 'la mesura presa es massa llarga',
  'més de 500 caràcters es refusa'
);

select throws_ok(
  $$ select public.edita_mesura_presa('00000000-0000-4000-8000-00000000dead', 'res') $$,
  '22023', 'aquest avis no existeix',
  'un avís que no existeix es refusa'
);

reset role;
select is(
  (select mesura_presa from public.avisos where id = (select id from fet where clau = 'sense')),
  'Reunió feta el dia 10',
  'i es desa'
);

select is(
  (select detall->>'abans' || '→' || (detall->>'ara') from public.audit_log
    where accio = 'edita_mesura_presa' and detall->>'avis' = (select id::text from fet where clau = 'sense')),
  'false→true',
  'l''edició queda al registre, sense el text'
);

select tests.authenticate_as('junta_alfa');
select lives_ok(
  format($$ select public.edita_mesura_presa(%L, E' \t ') $$, (select id from fet where clau = 'amb')),
  'un text en blanc l''esborra'
);
reset role;
select is(
  (select mesura_presa from public.avisos where id = (select id from fet where clau = 'amb')),
  null,
  'i queda null, no un blanc'
);

-- ── qui no ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  format($$ select public.edita_mesura_presa(%L, 'jo mateix') $$, (select id from fet where clau = 'sense')),
  '42501', 'nomes junta',
  'un soci no la pot escriure, ni la del seu avís'
);

reset role;
select ok(
  not has_table_privilege('authenticated', 'public.avisos', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.avisos', 'mesura_presa', 'UPDATE'),
  'cap grant d''UPDATE: el camí directe no existeix'
);

-- La persona afectada la llegeix: és el seu avís, i la política ja li'l dona.
select tests.authenticate_as('bravo');
select is(
  (select mesura_presa from public.avisos where id = (select id from fet where clau = 'sense')),
  'Reunió feta el dia 10',
  'qui hi surt la llegeix al seu avís'
);

reset role;
select throws_ok(
  format($$ update public.avisos set mesura_presa = ' amb blancs ' where id = %L $$,
         (select id from fet where clau = 'sense')),
  '23514', null,
  'el CHECK la vol retallada encara que algú se salti la RPC'
);

select * from finish();
rollback;

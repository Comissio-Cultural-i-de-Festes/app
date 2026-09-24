-- La gravetat d'un avís: el tipus la suggereix, la junta la tria.
--
-- El que es fixa aquí és el contracte nou d'`avisa()` —la gravetat triada es
-- desa, null vol dir la del tipus, fora de l'1-3 es refusa amb 22023— i les dues
-- coses que la 85 ha de garantir perquè no es trenqui res del que ja hi havia:
-- que hi ha UNA sola `avisa()` (una segona seria PGRST203 a totes les crides) i
-- que el nucli nou, `private.registra_avis`, no el pot cridar ningú des de
-- fora. Les regles del sostre i de la nota no es tornen a provar aquí: les
-- proven la 465, la 466, la 467 i la 468 contra aquesta mateixa funció.
--
-- Les files que s'asserten es fan aquí dins i es compten per l'avís que torna
-- cada crida, no per quantes n'hi ha: la suite d'RLS escriu avisos i no desfà
-- res.

begin;
select plan(13);

reset role;
update public.ranking_periods
   set starts_at = now() - interval '30 days', ends_at = null
 where mena = 'global';

create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;

-- ── qui ────────────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000002', 'no_va_venir', 'prova', 0, null, 2) $$,
  '42501', 'nomes junta',
  'un soci no posa cap avís, triï la gravetat que triï'
);

-- ── la junta tria ──────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

insert into fet
select 'triada', public.avisa(
  '00000000-0000-4000-8000-000000000002', 'no_va_venir', 'Prova: la junta ho veu més greu', -5, null, 3
);

insert into fet
select 'suggerida', public.avisa(
  '00000000-0000-4000-8000-000000000002', 'va_deixar_ho', 'Prova: sense triar', 0, null, null
);

-- Per nom, com crida PostgREST: sense `p_punts` ni `p_event_id`, que tenen
-- valor per defecte. Si hi hagués dues `avisa()`, aquesta crida seria ambigua.
insert into fet
select 'per_nom', public.avisa(
  p_user_id => '00000000-0000-4000-8000-000000000002',
  p_tipus => 'mal_gest',
  p_nota => 'Prova: per nom',
  p_gravetat => 2
);

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000002', 'no_va_venir', 'prova', 0, null, 0) $$,
  '22023', 'la gravetat va d''1 a 3',
  'una gravetat de zero es refusa'
);

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000002', 'no_va_venir', 'prova', 0, null, 4) $$,
  '22023', 'la gravetat va d''1 a 3',
  'i una de quatre també: el CHECK de la taula continua sent 1..3'
);

reset role;

select is(
  (select a.gravetat from public.avisos a where a.id = (select id from fet where clau = 'triada')),
  3,
  'la gravetat que la junta tria és la que es desa, encara que el tipus en suggereixi una altra'
);

select is(
  (select a.gravetat from public.avisos a where a.id = (select id from fet where clau = 'suggerida')),
  2,
  'amb null, mana la del tipus: va_deixar_ho és greu'
);

select is(
  (select a.gravetat from public.avisos a where a.id = (select id from fet where clau = 'per_nom')),
  2,
  'i la crida per nom, com la fa PostgREST, també la desa'
);

select is(
  (select detall->>'gravetat' || '/' || (detall->>'gravetat_suggerida')
     from public.audit_log
    where accio = 'avis' and detall->>'avis' = (select id::text from fet where clau = 'triada')),
  '3/1',
  'l''auditoria guarda la gravetat triada i la suggerida'
);

select is(
  (select detall ? 'nota' from public.audit_log
    where accio = 'avis' and detall->>'avis' = (select id::text from fet where clau = 'triada')),
  false,
  'i continua sense la nota, que viu a `avisos`'
);

select is(
  (select pl.created_at = a.created_at
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau = 'triada')),
  true,
  'la fila de punts porta la mateixa data que l''avís'
);

-- ── un tipus retirat del catàleg ───────────────────────────────────────────
update public.avis_tipus set actiu = false where clau = 'mal_gest';
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000002', 'mal_gest', 'prova', 0, null, 1) $$,
  '22023', 'tipus d''avis desconegut',
  'un tipus retirat no es pot posar, encara que la gravetat vingui triada'
);

reset role;

-- ── la forma ───────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'avisa'),
  1,
  'hi ha una sola avisa(): una segona seria PGRST203 a totes les crides'
);

-- Els sis primers i en aquest ordre. El que vingui després (la 86 hi afegeix la
-- mesura presa) ha d'anar al final pel mateix motiu.
select ok(
  (select pg_get_function_identity_arguments(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'avisa')
  like 'p_user_id uuid, p_tipus text, p_nota text, p_punts integer, p_event_id uuid, p_gravetat integer%',
  'i el paràmetre nou va després dels cinc de sempre, perquè les crides de quatre i cinc arguments no canviïn de sentit'
);

-- Per nom i no per firma: la firma del nucli pot créixer, i la tanca no.
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'registra_avis'
       and has_function_privilege('authenticated', p.oid, 'execute')
  ),
  'el nucli no el crida ningú des de fora: la porta és avisa(), que mira qui truca'
);

select * from finish();
rollback;

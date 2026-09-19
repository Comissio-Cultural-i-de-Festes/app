-- El sostre del curs quan AVUI cau fora de la finestra del curs.
--
-- QUE ES MIRA. `avisa()` decideix si deixa passar una resta comparant el
-- sostre amb el que ja s'ha gastat DINS la finestra de `private.periode_curs()`.
-- La migracio 78 va arreglar de quin curs es cada moviment —el de l'avis que
-- l'explica i no el de la seva propia data—, i amb aixo la compensacio d'un
-- avis vell ja no obre marge en aquest curs. El que cap de les dues versions
-- mira es si la fila que esta A PUNT D'ESCRIURE cau dins de la finestra.
--
-- I no hi cau sempre. `avisa()` escriu amb `now()`, i `ranking_periods` no
-- obliga enlloc que la finestra `global` contingui el dia d'avui:
-- `admin_save_periods` comprova els codis, les menes, els ordres repetits, que
-- un periode no acabi abans de comencar i que els trimestres vagin seguits, i
-- res mes. O sigui que hi ha dos dies normals en que AVUI queda fora:
--
--   · el curs que ve ja esta escrit i encara no ha comencat —la junta prepara
--     el calendari al juliol, que es quan es prepara—; i
--   · el curs s'ha acabat i ningu no ha obert el seguent.
--
-- Mentre dura qualsevol dels dos, cada avis nou s'escriu amb una data que la
-- finestra no cobreix, o sigui que el gastat que `avisa()` suma es sempre zero
-- i el sostre no fita res: es pot repetir la mateixa resta tantes vegades com
-- es vulgui. L'unica verja que queda es l'`abs(punts) > 500` per crida, que es
-- exactament la que l'issue #4 va dir que no bastava: «`abs(punts) > 500` per
-- crida no impedeix repetir la crida».
--
-- AQUEST FITXER NO AFIRMA QUIN COMPORTAMENT ES EL CORRECTE. Afirma quin es el
-- d'avui, amb numeros, perque ara mateix no hi ha cap prova que el fixi en cap
-- sentit. Si un dia es decideix que `avisa()` ha de refusar —o comptar— una
-- fila que cau fora del curs, les dues assercions de sota canvien de sentit i
-- es veura que ha canviat.
--
-- Gent i fets inventats, com a tot el repo.

begin;
select plan(4);

reset role;

delete from public.avisos;
delete from public.points_log;

update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

create temporary table qui as
select tests.uid('alfa') as alfa, tests.uid('bravo') as bravo;
grant select on qui to authenticated;

-- ── 1. el control: amb AVUI dins la finestra, el sostre fita ───────────────
update public.ranking_periods
   set starts_at = now() - interval '10 days',
       ends_at   = null
 where mena = 'global';

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.avisa(%L, 'greu', 'gasta el sostre sencer', -200, null) $$,
         (select alfa from qui)),
  'amb avui dins la finestra, la primera resta de 200 hi cap'
);

select throws_ok(
  format($$ select public.avisa(%L, 'greu', 'i una mes', -200, null) $$, (select alfa from qui)),
  '22023', 'sostre de punts del curs',
  'i la segona ja no: el sostre del curs fita el total, no cada crida'
);

-- ── 2. el curs encara no ha comencat ───────────────────────────────────────
-- La junta ha escrit el calendari del curs que ve i el d'ara ja no hi es. No
-- es cap estat corrupte: `admin_save_periods` ho accepta sense dir res.
reset role;

update public.ranking_periods
   set starts_at = now() + interval '12 days',
       ends_at   = null
 where mena = 'global';

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$
    select public.avisa(%1$L, 'greu', 'una', -200, null);
    select public.avisa(%1$L, 'greu', 'dues', -200, null);
    select public.avisa(%1$L, 'greu', 'tres', -200, null);
  $$, (select bravo from qui)),
  'amb el curs sense comencar, tres restes de 200 seguides hi passen totes'
);

reset role;

select is(
  (select coalesce(sum(pl.puntos), 0)::int
     from public.points_log pl
    where pl.user_id = (select bravo from qui)
      and pl.motivo in ('avis', 'avis_retirat')),
  -600,
  'i el total restat es 600 amb el sostre escrit a 200: la finestra no cobreix avui i el gastat sempre surt zero'
);

select * from finish();
rollback;

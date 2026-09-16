-- Un sol motiu per haver portat gent, i l'històric que no se'n ressent.
--
-- LES TRES LLISTES. La 71 en mou una, la 76 en mou una altra i la tercera no es
-- mou mai, i aquest fitxer és l'únic lloc on es veuen les tres alhora:
--
--   files de point_values    quins botons es dibuixen   → `conduir` FORA (71)
--   allowlist d'award_points què es pot crear ara       → `conduir` FORA (76)
--   CHECK de points_log      què pot EXISTIR            → `conduir` HI ÉS, i s'hi queda
--
-- L'ÚLTIMA ÉS LA QUE COSTA DE PROVAR i la que es trencarà sola: retallar el
-- CHECK no falla al desplegar, falla el dia que algú obre el perfil de qui va
-- portar gent al desembre. Per això aquí hi ha una fila de `conduir` escrita a
-- mà i llegida des del perfil del soci, i no només una asserció sobre el text
-- de la constraint.
--
-- I LA SEGONA JA ES PROVA. Fins que la 76 no va arribar, aquest fitxer deixava
-- escrit que no es provava a posta, perquè la 71 deixava el forat obert i una
-- asserció que digués «encara s'accepta» hauria semblat que allò era el que es
-- volia. Ara el forat és tancat i l'asserció mira cap a l'altra banda: una
-- crida a mà amb `p_motivo = 'conduir'` contesta 22023. És la meitat del canvi
-- que no es veu enlloc de l'app —`award_points` té el grant per a
-- `authenticated` sencer, o sigui que el camí que tanca és la consola del
-- navegador d'algú de la junta, no cap botó.
--
-- CADA REFÚS PORTA EL SEU CONTROL POSITIU, com demana el capçal de la 370: una
-- prova que només comprova que una cosa peta passaria igual el dia que peti
-- sempre. Al costat de «l'escala no pot ressuscitar `conduir`» hi ha una crida
-- que sí que funciona.
--
-- LA FILA DE `montaje` ES MIRA A PROPÒSIT. A producció la junta ja li ha canviat
-- el preu, i una migració que passés l'escala sencera per l'aigua se'ls
-- carregaria sense que res ho digués. Aquí encara val el de la llavor, o sigui
-- que l'asserció és que la 71 no l'ha tocada.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(13);

reset role;
delete from public.points_log;
delete from public.audit_log;

-- ── 1. L'escala: quins botons queden ────────────────────────────────────────

select is_empty(
  $$ select 1 from public.point_values where mena = 'motiu' and clau = 'conduir' $$,
  'conduir ja no és cap botó de la pantalla de donar punts'
);

select is(
  (select punts from public.point_values where mena = 'motiu' and clau = 'trajo_gente'),
  20,
  'i portar gent val 20, entremig dels 15 i els 25 que hi havia'
);

select results_eq(
  $$ select clau, ordre from public.point_values
      where mena = 'motiu' order by ordre $$,
  $$ values ('montaje', 1), ('trajo_gente', 2), ('propuso', 3) $$,
  'tres motius i cap forat a l''ordre, que és el que dibuixa la pantalla de l''escala'
);

select is(
  (select punts from public.point_values where mena = 'motiu' and clau = 'montaje'),
  20,
  'i la resta de l''escala no s''ha tocat: el que la junta hi hagi posat es queda'
);

-- ── 2. El botó que queda, premut de veritat ─────────────────────────────────

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'trajo_gente', 20) $$,
  'la junta pot premiar haver portat gent, que és l''únic motiu de cotxe que queda'
);

reset role;
select is(
  (select puntos from public.points_log
     where user_id = '00000000-0000-4000-8000-000000000002' and motivo = 'trajo_gente'),
  20,
  'i el que entra al llibre són els 20 de la fila, no cap número de la pantalla'
);

-- ── 2b. I `conduir` ja no es pot crear ──────────────────────────────────────
--
-- El camí que això tanca no és cap botó: és la consola del navegador d'algú de
-- la junta, perquè `award_points` té el grant per a `authenticated` sencer. El
-- codi importa —22023 és «motiu invàlid» i 42501 seria «no ets de la junta»—,
-- o sigui que aquesta asserció continuaria passant per la raó equivocada el dia
-- que la persona deixés de ser admin si només mirés que peta.

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'conduir', 25) $$,
  '22023',
  'motiu invalid',
  'ni a mà: des de la 76 l''allowlist d''award_points tampoc té conduir'
);

-- El control positiu del refús d'abans, i amb un altre motiu que el de cotxe:
-- la 76 reescriu la funció sencera, i el que s'ha de veure és que només n'ha
-- caigut un dels sis i no dos.
select lives_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'montaje', 20) $$,
  'i la resta de l''allowlist sobreviu a la reescriptura: muntatge encara entra'
);

-- ── 3. L'històric: què pot existir ──────────────────────────────────────────
--
-- La fila que la junta va donar al desembre, escrita com la va escriure
-- `award_points` quan `conduir` encara era un botó.
--
-- `reset role` abans i no confiant en el de més amunt: `authenticated` no té
-- INSERT sobre `points_log` —no hi entra res que no passi per una RPC—, o sigui
-- que això s'escriu com a superusuari a posta. Sense la línia, l'asserció no
-- provaria el CHECK sinó el grant, i amb un 42501 que sembla un altre problema.

reset role;

select lives_ok(
  $$ insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
     values ('00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-0000000000e1', 'conduir', 25,
             '00000000-0000-4000-8000-0000000000a1') $$,
  'el CHECK de points_log segueix acceptant conduir: l''històric no es reescriu'
);

reset role;
select tests.authenticate_as('bravo');

select is(
  (select puntos from public.points_log
     where user_id = '00000000-0000-4000-8000-000000000002' and motivo = 'conduir'),
  25,
  'i el soci la continua veient al seu registre, amb el motiu i tot'
);

select is(
  (select sum(puntos)::int from public.points_log
     where user_id = '00000000-0000-4000-8000-000000000002'),
  65,
  'i suma al total igual que qualsevol altra: 25 de l''històric i les dues d''ara'
);

-- ── 4. L'escala no el pot tornar a inventar ─────────────────────────────────
--
-- La 25 ho diu sencer: afegir un motiu és una fila, un CHECK i un allowlist, i
-- una pantalla només pot fer la primera. Ara que la fila de `conduir` no hi és,
-- la pantalla de l'escala ha de contestar el mateix que per a un motiu que no
-- ha existit mai.

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_set_point_value('motiu', 'conduir', 25) $$,
  'P0002',
  'aquest motiu no existeix',
  'la pantalla de l''escala no pot tornar a dibuixar el botó de conduir'
);

select lives_ok(
  $$ select public.admin_set_point_value('motiu', 'trajo_gente', 25) $$,
  'però sí que pot reajustar el que val portar gent, que és el que la 15 volia'
);

select * from finish();
rollback;

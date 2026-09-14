-- Les hores de la memòria, des de dins de la base.
--
-- TRES COSES QUE AQUEST FITXER FIXA I QUE NO ES VEUEN DES DE CAP PANTALLA.
--
-- La primera és la regla de `private.minuts_persona`, que és l'únic lloc on viu
-- «quantes hores ha fet aquesta persona». Es prova sola, amb hores literals, i
-- no a través del total: si es provés només pel total, una regla equivocada i
-- una finestra equivocada es podrien compensar i el fitxer passaria igual.
--
-- La segona és que una marca de sola torna NULL i no zero. Són dues coses
-- diferents —«no ho sabem» i «no hi va fer res»— i tota la pantalla de junta
-- depèn de poder-les distingir per posar-hi un guionet i demanar-ho.
--
-- La tercera és que `my_hores()` torna el títol d'una reunió d'àmbit junta a qui
-- hi consta com a assistent. És un forat deliberat en una barrera que la
-- migració 48 defensa en un paràgraf sencer, i està aquí escrit com a asserció
-- perquè el dia que algú el tanqui sense voler, ho vegi.
--
-- CADA REFÚS PORTA EL SEU CONTROL POSITIU, com demana el capçal de la 370: una
-- prova que només comprova que una cosa peta passaria igual el dia que peti
-- sempre.
--
-- LA FINESTRA DEL CURS ES FIXA AQUÍ DINS, relativa a `now()`. La que ve de la
-- llavor depèn del mes en què algú faci el reset, i un fitxer de proves que
-- passa al setembre i falla al juliol no és una prova.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(54);

reset role;

-- Res del que hi hagi de la llavor: els totals han de sortir d'aquí i d'enlloc
-- més.
delete from public.points_log;
delete from public.events;

update public.ranking_periods
   set starts_at = now() - interval '30 days',
       ends_at   = null
 where mena = 'global';

create temporary table quins as
select '00000000-0000-4000-8000-00000000fa01'::uuid as h1,  -- taller, visat
       '00000000-0000-4000-8000-00000000fa02'::uuid as h2,  -- reunió de junta
       '00000000-0000-4000-8000-00000000fa03'::uuid as h3,  -- festa fora de la uni
       '00000000-0000-4000-8000-00000000fa04'::uuid as h4,  -- fora del curs
       '00000000-0000-4000-8000-00000000fa05'::uuid as h5,  -- casa rural
       '00000000-0000-4000-8000-00000000fa06'::uuid as h6,  -- hi va dir que sí i prou
       '00000000-0000-4000-8000-00000000fa07'::uuid as h7;  -- va entrar i no va sortir
grant select on quins to authenticated;

-- Els identificadors de les persones, guardats abans de canviar de rol: dins
-- d'una persona, `tests.*` és inaccessible i una crida a `tests.uid()` peta amb
-- «permission denied for schema tests». Igual que `quins`, la taula temporal
-- necessita el seu grant per sobreviure el canvi.
create temporary table qui as
select tests.uid('alfa')       as alfa,
       tests.uid('bravo')      as bravo,
       tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

insert into public.events (
  id, tipo, abast, starts_at, puntos, published, a_la_uni, minuts_memoria,
  hores_verificat_at, hores_verificat_per
)
select q.h1, 'actividad', 'comi', now() - interval '10 days', 10, true, true, 240,
       now() - interval '1 day', tests.uid('junta_alfa')
  from quins q
union all
select q.h2, 'reunio', 'junta', now() - interval '9 days', 0, true, true, 60, null, null from quins q
union all
select q.h3, 'fiesta', 'comi', now() - interval '8 days', 10, true, false, 240, null, null from quins q
union all
select q.h4, 'actividad', 'comi', now() - interval '60 days', 10, true, true, 120, null, null from quins q
union all
select q.h5, 'casa_rural', 'comi', now() - interval '7 days', 30, true, false, 2760, null, null from quins q
union all
select q.h6, 'actividad', 'comi', now() - interval '6 days', 10, true, true, 120, null, null from quins q
union all
select q.h7, 'actividad', 'comi', now() - interval '5 days', 10, true, true, 120, null, null from quins q;

insert into public.event_title (event_id, titulo)
select q.h1, 'Taller inventat' from quins q
union all select q.h2, 'Junta inventada' from quins q
union all select q.h3, 'Festa inventada' from quins q
union all select q.h4, 'Cosa vella inventada' from quins q
union all select q.h5, 'Cap de setmana inventat' from quins q
union all select q.h6, 'Cosa a la qual no va anar' from quins q
union all select q.h7, 'Taller sense sortida' from quins q;

-- L'alfa: al taller hi va entrar una hora tard i va marxar a les tres hores
-- (120), a la junta hi era i no hi ha cap marca (60 sencers), al taller sense
-- sortida només hi ha entrada (NULL), a la festa i a la cosa vella hi va ser
-- però no compten, i a l'última només hi va dir que sí.
insert into public.attendances (user_id, event_id, estado, checked_in_at, exit_photo_at)
select tests.uid('alfa'), q.h1, 'asistio',
       (now() - interval '10 days') + interval '1 hour',
       (now() - interval '10 days') + interval '3 hours'
  from quins q
union all select tests.uid('alfa'), q.h2, 'asistio', null, null from quins q
union all select tests.uid('alfa'), q.h3, 'asistio', null, null from quins q
union all select tests.uid('alfa'), q.h4, 'asistio', null, null from quins q
union all select tests.uid('alfa'), q.h6, 'si',      null, null from quins q
union all select tests.uid('alfa'), q.h7, 'asistio',
       (now() - interval '5 days') + interval '10 minutes', null
  from quins q;

-- ── 1. la porta de `my_hores` ───────────────────────────────────────────────

reset role;
select tests.authenticate_as('pendent_alfa');
select throws_ok(
  $$ select public.my_hores() $$,
  '42501', null,
  'qui encara espera l''alta no te hores'
);

reset role;
select tests.authenticate_as('baixa_alfa');
select throws_ok(
  $$ select public.my_hores() $$,
  '42501', null,
  'i qui es de baixa, tampoc'
);

reset role;
select tests.authenticate_as('alfa');
select lives_ok(
  $$ select public.my_hores() $$,
  'i un soci actiu si'
);

-- ── 2. què hi compta i què no ───────────────────────────────────────────────

select is(
  (public.my_hores() ->> 'minuts')::int,
  180,
  'el total son les dues hores del taller mes l''hora de la junta'
);

select is(
  (public.my_hores() ->> 'minuts_provisionals')::int,
  60,
  'i les que encara no estan visades son nomes les de la junta'
);

select is(
  (public.my_hores() ->> 'quantes')::int,
  3,
  'hi surten tres activitats, comptant-hi la que no se sap'
);

select is(
  (select f ->> 'minuts'
     from jsonb_array_elements(public.my_hores() -> 'files') f
    where f ->> 'event_id' = (select h7::text from quins)),
  null,
  'la que nomes te entrada hi surt amb els minuts a null, que no es zero'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.my_hores() -> 'files') f
     where f ->> 'event_id' = (select h3::text from quins)
  ),
  'la festa de fora de la uni no hi es'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.my_hores() -> 'files') f
     where f ->> 'event_id' = (select h4::text from quins)
  ),
  'ni el que va passar abans que comences el curs'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.my_hores() -> 'files') f
     where f ->> 'event_id' = (select h6::text from quins)
  ),
  'ni allo on nomes va dir que hi aniria'
);

-- El forat deliberat de la migració 48, escrit perquè es vegi el dia que canviï.
select is(
  (select f ->> 'titol'
     from jsonb_array_elements(public.my_hores() -> 'files') f
    where f ->> 'event_id' = (select h2::text from quins)),
  'Junta inventada',
  'de la reunio de junta on hi va ser, en llegeix el titol'
);

select is(
  (public.my_hores() ->> 'des_de') is not null,
  true,
  'i la resposta diu de quan compta'
);

-- ── 3. la regla, provada sola ───────────────────────────────────────────────

reset role;

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, null, null, null),
  240,
  'sense cap marca es fan les hores senceres'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, '2026-05-01 20:00+00', '2026-05-01 22:00+00', null),
  120,
  'qui arriba a la meitat en fa la meitat'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, '2026-05-01 18:00+00', '2026-05-01 19:30+00', null),
  90,
  'i qui marxa aviat, fins que marxa'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, '2026-05-01 17:00+00', '2026-05-02 00:00+00', null),
  420,
  'les marques manen: un muntatge que s''allarga son les hores que s''hi ha estat'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, '2026-05-01 20:00+00', null, null),
  null,
  'nomes entrada no diu quanta estona, i torna null'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, null, '2026-05-01 22:00+00', null),
  null,
  'i nomes sortida, tampoc'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, '2026-05-01 22:00+00', '2026-05-01 20:00+00', null),
  0,
  'una sortida abans de l''entrada no son hores negatives'
);

select is(
  private.minuts_persona('2026-05-01 18:00+00', 240, '2026-05-01 20:00+00', null, 30),
  30,
  'l''excepcio de la junta guanya, tambe quan el calcul no en sap res'
);

-- ── 4. la porta d'`admin_set_hores` ─────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  format($$ select public.admin_set_hores(%L, 90, true) $$, (select h1 from quins)),
  '42501', null,
  'un soci no pot dir quant val una activitat'
);

-- Per sota d'un visat no s'hi toca: primer s'ha de desfer el vist.
reset role;
select tests.authenticate_as('junta_alfa');
select throws_ok(
  format($$ select public.admin_set_hores_persona(%L, %L, 45) $$,
         (select h1 from quins), (select alfa from qui)),
  'P0001', null,
  'ni la junta pot ajustar una persona sota unes hores ja visades'
);

select lives_ok(
  format($$ select public.admin_set_hores(%L, 90, true) $$, (select h1 from quins)),
  'la junta si que pot canviar la durada'
);

select is(
  (select e.minuts_memoria from public.events e where e.id = (select h1 from quins)),
  90,
  'els minuts son els que ha dit'
);

select is(
  (select e.hores_verificat_at from public.events e where e.id = (select h1 from quins)),
  null,
  'i canviar-los ha tret el visat, perque una xifra visada que canvia deixa de ser-ho'
);

select throws_ok(
  format($$ select public.admin_set_hores(%L, 4321, true) $$, (select h1 from quins)),
  '22023', null,
  'quatre mil tres-cents vint-i-un minuts es un zero de mes'
);

select throws_ok(
  $$ select public.admin_set_hores('00000000-0000-4000-8000-00000000face', 90, true) $$,
  'P0002', null,
  'i un esdeveniment que no hi es, no hi es'
);

select throws_ok(
  format($$ select public.admin_set_hores(%L, 120, true) $$, (select h5 from quins)),
  '22023', null,
  'una casa rural no es a la uni, i ho diu amb una frase i no amb un 23514'
);

-- El doble toc. Es compta, no s'ordena: `created_at` és el mateix instant per a
-- totes les crides d'aquesta transacció.
select public.admin_set_hores((select h1 from quins), 90, true);
select is(
  (select count(*)::int from public.audit_log
    where accio = 'set_hores' and target_id = (select h1 from quins)),
  1,
  'desar el mateix dues vegades deixa una sola linia al registre'
);

-- ── 5. l'excepció d'una persona, i tornar a visar ───────────────────────────

select throws_ok(
  format($$ select public.admin_set_hores_persona(%L, %L, 45) $$,
         (select h1 from quins), (select bravo from qui)),
  'P0002', null,
  'no es pot ajustar les hores d''algu que no hi era'
);

select lives_ok(
  format($$ select public.admin_set_hores_persona(%L, %L, 45) $$,
         (select h1 from quins), (select alfa from qui)),
  'i les de qui si que hi era, si'
);

select is(
  (select (g ->> 'minuts_calcul')::int
     from jsonb_array_elements(
            public.admin_hores_esdeveniment((select h1 from quins)) -> 'gent') g
    where g ->> 'user_id' = (select alfa from qui)::text),
  120,
  'i la pantalla pot dir que el calcul en deia cent vint'
);

reset role;
select tests.authenticate_as('alfa');
select is(
  (public.my_hores() ->> 'minuts')::int,
  105,
  'el total del soci ja son els quaranta-cinc minuts i la junta'
);

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  format($$ select public.admin_visa_hores(%L, true) $$, (select h1 from quins)),
  '42501', null,
  'un soci no visa res'
);

reset role;
select tests.authenticate_as('junta_alfa');
select lives_ok(
  format($$ select public.admin_visa_hores(%L, true) $$, (select h1 from quins)),
  'i la junta si'
);

select is(
  (select e.hores_verificat_per from public.events e where e.id = (select h1 from quins)),
  (select junta from qui),
  'i queda escrit qui ho ha visat'
);

-- ── 6. el resum del curs i el que queda per fer ─────────────────────────────

reset role;
select tests.authenticate_as('alfa');
select is_empty(
  $$ select * from public.admin_hores_socis() $$,
  'un soci demana el resum de tothom i no en treu cap fila'
);

select throws_ok(
  $$ select public.admin_hores_pendents() $$,
  '42501', null,
  'ni el recompte del que queda per visar'
);

reset role;
select tests.authenticate_as('junta_alfa');
select isnt_empty(
  $$ select * from public.admin_hores_socis() $$,
  'i la junta si'
);

select is(
  (select s.quantes from public.admin_hores_socis() s where s.user_id = (select alfa from qui)),
  3,
  'al resum, l''alfa hi consta amb les tres activitats que compten'
);

-- Queden la reunió de junta, el taller sense sortida i la que ningú no va
-- marcar: les tres son a la uni, ja han passat i no estan visades. La que sí que
-- ho està, no hi compta. Una activitat sense ningú apuntat hi surt igualment,
-- a posta: pot voler dir que no hi va anar ningú, o que la junta es va descuidar
-- de marcar-ho, i totes dues coses són coses que s'han de mirar.
select is(
  (public.admin_hores_pendents() ->> 'activitats')::int,
  3,
  'queden tres activitats per visar, i la que ja ho esta no hi compta'
);

-- ── 7. crear-ne una ja diu quant val ────────────────────────────────────────
-- Sense hora de final no hi ha durada, i sense durada no hi ha memòria: val més
-- refusar el desat que desar una activitat que valdrà zero hores i que ningú no
-- tornarà a mirar.

select throws_ok(
  $$ select public.admin_save_event(
       'Sense final inventat', 'actividad', now() + interval '3 days') $$,
  '22023', null,
  'sense hora de final no es desa'
);

select throws_ok(
  $$ select public.admin_save_event(
       'Al reves inventat', 'actividad', now() + interval '3 days',
       p_ends_at => now() + interval '2 days') $$,
  '22023', null,
  'ni amb un final anterior a l''inici'
);

create temporary table nova as
select public.admin_save_event(
  'Taller nou inventat', 'actividad', now() + interval '3 days',
  p_ends_at => now() + interval '3 days' + interval '150 minutes') as id;
grant select on nova to authenticated;

select is(
  (select e.minuts_memoria from public.events e where e.id = (select id from nova)),
  150,
  'i en crear-la, els minuts surten de l''horari'
);

select is(
  (select e.a_la_uni from public.events e where e.id = (select id from nova)),
  true,
  'i una activitat neix marcada com a feta a la uni'
);

-- ── 8. les columnes no s'escriuen per la porta del davant ───────────────────
-- El grant d'UPDATE sobre `events` es va retirar a la migració 19, o sigui que
-- això és un 42501 i no un UPDATE que filtra zero files. S'asseveura el codi
-- justament per això.

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  format($$ update public.events set minuts_memoria = 999 where id = %L $$,
         (select h1 from quins)),
  '42501', null,
  'un soci no pot escriure els minuts directament'
);

-- ── 9. i quin curs, quan n'hi ha dos ────────────────────────────────────────

reset role;
insert into public.ranking_periods (codi, starts_at, ends_at, ordre, mena)
values ('curs_vell', now() - interval '400 days', now() - interval '35 days', 9, 'global');

select is(
  (select count(*)::int from private.periode_curs()),
  1,
  'amb dues files de curs, el resolutor en tria una i prou'
);

-- ── 10. la feina, amb el cami per anar-hi ───────────────────────────────────
-- Sense la llista, `/junta/hores` tenia el numero de la feina i cap porta: al
-- formulari d'una activitat passada no s'hi arriba des d'enlloc.

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  jsonb_array_length(public.admin_hores_pendents() -> 'files'),
  (public.admin_hores_pendents() ->> 'activitats')::int,
  'hi ha tantes files com activitats diu que queden'
);

select is(
  (select f ->> 'event_id'
     from jsonb_array_elements(public.admin_hores_pendents() -> 'files')
          with ordinality as x(f, i)
    where i = 1),
  (select h2::text from quins),
  'i la mes antiga va primer, que es la que fa mes dies que espera'
);

select is(
  (select (f ->> 'persones')::int
     from jsonb_array_elements(public.admin_hores_pendents() -> 'files') f
    where f ->> 'event_id' = (select h2::text from quins)),
  1,
  'cada fila diu quanta gent hi consta'
);

-- ── 11. i les funcions de private no les crida ningu des de fora ────────────
-- Nomes les criden funcions definer, que corren com el propietari. Un definer
-- amb l'EXECUTE al defecte de Postgres —PUBLIC— no es l'estil d'aquest repo,
-- i `010_structure` nomes vigila `public`.

reset role;

select ok(
  not has_function_privilege('authenticated',
    'private.minuts_persona(timestamptz,int,timestamptz,timestamptz,int)'::regprocedure, 'execute'),
  'un soci no pot cridar la regla de les hores directament'
);

select ok(
  not has_function_privilege('authenticated', 'private.periode_curs()'::regprocedure, 'execute'),
  'ni el resolutor del curs, que es definer'
);

select ok(
  not has_function_privilege('authenticated',
    'private.memoria_minuts(text,timestamptz,timestamptz)'::regprocedure, 'execute'),
  'ni el calcul de la durada per defecte'
);

select ok(
  not has_function_privilege('authenticated',
    'private.memoria_a_la_uni_defecte(text)'::regprocedure, 'execute'),
  'ni el defecte de la marca'
);

select * from finish();
rollback;

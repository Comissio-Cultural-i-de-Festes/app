-- Les reunions, i sobretot què NO toquen.
--
-- LA REGLA QUE AQUEST FITXER DEFENSA és de justícia, i la va donar el
-- mantenidor: una reunió que és només de junta no ha d'afegir punts ni ratxes a
-- qui hi va, ni tocar les ratxes de qui no hi va.
--
-- La segona meitat és la que costa de veure i la que aquest fitxer existeix per
-- protegir. `private.streak_rows` compta TOT esdeveniment publicat i passat per
-- a TOTHOM: sense el filtre, cada reunió de junta és una activitat que cada
-- soci de fora consta com a no haver-hi anat, i amb tres reunions al mes la
-- ratxa de tota l'associació es trenca per coses que no els van passar. No hi
-- ha cap pantalla on això es vegi —surt com una ratxa que baixa— i per tant no
-- hi ha res que ho descobreixi si no és aquí.
--
-- Els UUID van escrits sencers a les assercions de seguretat.
-- Persones i reunions inventades, com a tot el repo.

begin;
select plan(44);

reset role;
delete from public.audit_log;

create temporary table que as
select
  '00000000-0000-4000-8000-0000000000c1'::uuid as junta,
  '00000000-0000-4000-8000-0000000000c2'::uuid as comi;
grant select on que to authenticated;

-- `streak_rows` no compta el que va passar abans que fossis soci, i el seed
-- crea els perfils ara mateix: sense això, una reunió de fa dos dies queda
-- fora per a tothom i l'assercó de la ratxa passaria per un motiu que no és el
-- que es vol provar.
update public.profiles
   set created_at = now() - interval '365 days'
 where id in (
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000000a2'
 );

-- Dues reunions passades: una de junta i una de tota la comi.
insert into public.events (id, tipo, abast, starts_at, puntos, published)
values
  ((select junta from que), 'reunio', 'junta', now() - interval '2 days', 0, true),
  ((select comi from que), 'reunio', 'comi', now() - interval '2 days', 5, true);

insert into public.event_title (event_id, titulo)
values
  ((select junta from que), 'Reunió de preparació inventada'),
  ((select comi from que), 'Assemblea inventada');

-- ── el tipus existeix i l'àmbit també ───────────────────────────────────────
select is(
  (select tipo from public.events where id = (select junta from que)),
  'reunio',
  'una reunió és un quart tipus d''esdeveniment'
);

select is(
  (select punts from public.point_values
    where mena = 'tipus_esdeveniment' and clau = 'reunio'),
  5,
  'i té els seus punts per defecte a l''escala, com la resta'
);

-- ── qui la veu ──────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.events where id = (select junta from que)),
  0,
  'un soci no veu una reunió de junta, ni sabent-ne l''identificador'
);

select is(
  (select count(*)::int from public.events_public where id = (select junta from que)),
  0,
  'ni per la vista que llegeixen les pantalles'
);

select is(
  (select count(*)::int from public.events_public where id = (select comi from que)),
  1,
  'però la de tota la comi sí, que és el que la fa sortir a l''Inici'
);

-- I EL TÍTOL TAMPOC, que tenia la seva pròpia porta i la capa d'RLS la va
-- trobar. `etitle_select_member` demana `event_is_revealed`, i una reunió no
-- té `reveal_at`: estava revelada des del primer moment, o sigui que un soci
-- podia llegir el títol d'una reunió de junta demanant-lo per identificador
-- encara que l'esdeveniment sencer li quedés invisible.
select is(
  (select count(*)::int from public.event_title where event_id = (select junta from que)),
  0,
  'ni el títol per la seva taula, que és per on s''hi arribava'
);

select is(
  (select count(*)::int from public.event_title where event_id = (select comi from que)),
  1,
  'mentre que el d''una reunió de comi sí que es llegeix'
);

reset role;
select tests.authenticate_as('junta_alfa');
select is(
  (select count(*)::int from public.events where id = (select junta from que)),
  1,
  'i la junta veu la seva, per events_select_admin'
);

-- ── convocar-la ─────────────────────────────────────────────────────────────
select throws_ok(
  $$ select public.admin_save_event(
       'Festa secreta inventada', 'fiesta', now() + interval '10 days',
       p_abast => 'junta') $$,
  '22023',
  null,
  'l''àmbit junta només val per a una reunió: una festa amagada no l''ha dissenyat ningú'
);

-- La crida va a una taula temporal i no dins d'un `where`: allà Postgres
-- l'avalua durant l'escaneig i la fila encara no existeix, o sigui que la
-- comparació no troba res i l'assercó passa amb un NULL.
create temporary table nova as
select public.admin_save_event(
  'Reunió inventada de junta', 'reunio', now() + interval '3 days',
  p_published => true, p_abast => 'junta') as id;
grant select on nova to authenticated;

select is(
  (select puntos from public.events where id = (select id from nova)),
  0,
  'i una reunió de junta es desa amb zero punts, perquè en tancar-la no en dóna cap'
);

-- ── tancar-la ───────────────────────────────────────────────────────────────
-- La de comi: reparteix punts.
select is(
  (public.admin_close_meeting(
     (select comi from que),
     array['00000000-0000-4000-8000-000000000001'::uuid,
           '00000000-0000-4000-8000-000000000002'::uuid],
     'Quatre línies inventades.'
   ) ->> 'hi_eren')::int,
  2,
  'tancar-la marca qui hi era'
);

select is(
  (select count(*)::int from public.points_log
    where event_id = (select comi from que) and motivo = 'asistencia'),
  2,
  'i en una reunió de comi reparteix els punts, que és el que la tanca'
);

select is(
  (select acta from public.event_details where event_id = (select comi from que)),
  'Quatre línies inventades.',
  'i desa l''acta'
);

select isnt(
  (select tancada_at from public.events where id = (select comi from que)),
  null,
  'i la marca com a tancada'
);

-- Idempotent: `points_log_asistencia_unic` fa que tornar a tancar-la no pagui
-- dues vegades. És l'índex que `010_structure` pinsa amb el seu indexdef.
select lives_ok(
  $$ select public.admin_close_meeting(
       (select comi from que),
       array['00000000-0000-4000-8000-000000000001'::uuid,
             '00000000-0000-4000-8000-000000000002'::uuid]) $$,
  'es pot tornar a tancar'
);

select is(
  (select count(*)::int from public.points_log
    where event_id = (select comi from que) and motivo = 'asistencia'),
  2,
  'i no paga dues vegades'
);

-- Treure algú de la llista l'ha de deixar de comptar: tancar-la dues vegades
-- amb llistes diferents ha de deixar el que diu la segona.
select is(
  (public.admin_close_meeting(
     (select comi from que),
     array['00000000-0000-4000-8000-000000000001'::uuid]
   ) ->> 'hi_eren')::int,
  1,
  'i treure algú de la llista el deixa de comptar com a assistent'
);

-- ── I LA REGLA DE JUSTÍCIA ──────────────────────────────────────────────────
-- La de junta: cap punt per a qui hi va.
select is(
  (public.admin_close_meeting(
     (select junta from que),
     array['00000000-0000-4000-8000-0000000000a1'::uuid,
           '00000000-0000-4000-8000-0000000000a2'::uuid]
   ) ->> 'hi_eren')::int,
  2,
  'una reunió de junta també es tanca i marca qui hi era, que és el que l''acta necessita'
);

select is(
  (select count(*)::int from public.points_log
    where event_id = (select junta from que)),
  0,
  'però NO reparteix cap punt: seria injust per a la gent de fora de la junta'
);

-- I cap ratxa, ni de qui hi va ni de qui no. Aquesta és la meitat que no es
-- veu en cap pantalla.
--
-- `reset role` abans: `private.streak_rows` està revocada d'`authenticated`
-- —cap pantalla la crida directament, hi arriba per `my_streak`— i des del
-- rol de la junta la crida és un 42501.
reset role;

select is(
  (select count(*)::int from private.streak_rows('00000000-0000-4000-8000-0000000000a1')
    where event_id = (select junta from que)),
  0,
  'ni compta com a activitat per a la ratxa de qui hi va'
);

select is(
  (select count(*)::int from private.streak_rows('00000000-0000-4000-8000-000000000001')
    where event_id = (select junta from que)),
  0,
  'ni —i això és el que importa— com una activitat que un soci de fora consta com a haver-se perdut'
);

select is(
  (select count(*)::int from private.streak_rows('00000000-0000-4000-8000-000000000001')
    where event_id = (select comi from que)),
  1,
  'mentre que una reunió de tota la comi sí que hi compta: tothom hi podia venir'
);

-- ── i les insígnies: cap reunió hi compta ───────────────────────────────────
-- `de_tot` compta menes; amb les reunions dins es podria guanyar amb festa +
-- reunió + activitat i canviaria per a qui ja la té.
select is(
  (select count(*)::int from public.badges b
     join public.events e on e.id = b.event_id
    where e.tipo = 'reunio'),
  0,
  'cap insígnia surt d''una reunió: les insígnies són la vida social, no la feina'
);

-- ── el registre ─────────────────────────────────────────────────────────────
select is(
  (select detall ->> 'abast' from public.audit_log
    where accio = 'close_meeting' and target_id = (select junta from que)),
  'junta',
  'i cada tancament deixa la seva línia al registre, amb l''àmbit'
);

reset role;
-- ── i les dues portes del darrere ───────────────────────────────────────────
-- La regla «una reunió de junta no reparteix punts» va néixer dins
-- `admin_close_meeting`, i una regla que viu dins d'una funció val només per
-- aquella funció. `check_in` reparteix `asistencia` i es tria per URL: sense
-- res que ho aturi, obrir l'escàner sobre una reunió de junta pagava.
reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format(
    $$select public.check_in(%L, null, %L, %L)$$,
    (select junta from que),
    '00000000-0000-4000-8000-000000000001'::uuid,
    gen_random_uuid()
  ),
  '22023',
  null,
  'la porta no fitxa a una reunio: es tanca, no s''escaneja'
);

select throws_ok(
  format(
    $$select public.check_in(%L, null, %L, %L)$$,
    (select comi from que),
    '00000000-0000-4000-8000-000000000001'::uuid,
    gen_random_uuid()
  ),
  '22023',
  null,
  'i tampoc a una de la comi, que tambe es tanca'
);

-- I la regla mateixa, a la taula: qualsevol cami hi topa, no només aquests dos.
reset role;

select throws_ok(
  format(
    $$insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
      values (%L, %L, 'montaje', 40, %L)$$,
    '00000000-0000-4000-8000-000000000001'::uuid,
    (select junta from que),
    '00000000-0000-4000-8000-0000000000a9'::uuid
  ),
  '22023',
  null,
  'ni un insert directe: la regla es de points_log i no de cap RPC'
);

select lives_ok(
  format(
    $$insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
      values (%L, %L, 'montaje', 40, %L)$$,
    '00000000-0000-4000-8000-000000000001'::uuid,
    (select comi from que),
    '00000000-0000-4000-8000-0000000000a9'::uuid
  ),
  'mentre que una reunio de tota la comi si que en pot donar'
);

-- ── i la tercera, que es fitxa des del lloc ─────────────────────────────────
-- `check_in_here` és definer i llegeix `events` sense RLS, o sigui que la
-- política que amaga les reunions de junta no la protegeix. Els punts ja els
-- para el disparador; el que aquí es comprova és que la fila d'assistència
-- tampoc s'escrigui, perquè sortir al llistat de qui hi era és el que una
-- reunió de junta no ha d'ensenyar.
reset role;

insert into private.event_geo (event_id, lat, lng, radi_m) values
  ((select junta from que), 41.5388, 2.4449, 150),
  ((select comi from que), 41.5388, 2.4449, 150);

-- Dins de la finestra, que si no la resposta seria 'tancat' i la prova passaria
-- per la raó equivocada.
update public.events set starts_at = now() where id in (
  (select junta from que), (select comi from que)
);

select tests.authenticate_as('alfa');

select is(
  public.check_in_here((select junta from que), 41.5388, 2.4449, 10)->>'estat',
  'no_hi_es',
  'un soci a sobre del punt no s''afegeix a una reunio de junta'
);

select is(
  public.check_in_here((select comi from que), 41.5388, 2.4449, 10)->>'estat',
  'no_hi_es',
  'ni a una de la comi: qui hi era ho diu qui la tanca'
);

reset role;

select is(
  (select count(*)::int from public.attendances
    where event_id in ((select junta from que), (select comi from que))
      and user_id = '00000000-0000-4000-8000-000000000001'
      and checked_in_at is not null),
  0,
  'i no queda cap fila de fitxatge a cap de les dues'
);

-- I EL CONTROL, sense el qual les tres de sobre passarien per la raó
-- equivocada: amb el punt mal posat o la finestra tancada, `check_in_here`
-- torna 'no_hi_es' i 'tancat' per a tot i les assercions no proven res. Una
-- festa de debò al mateix punt i a la mateixa hora ha d'entrar.
create temp table festa as
select '00000000-0000-4000-8000-0000000000fc'::uuid as id;
grant select on festa to authenticated;

insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, published, created_by)
values (
  (select id from festa), 'fiesta', now(), 50, 0, 10, true,
  '00000000-0000-4000-8000-0000000000a1'
);

insert into public.event_title (event_id, titulo)
values ((select id from festa), 'Festa inventada de control');

insert into private.event_geo (event_id, lat, lng, radi_m)
values ((select id from festa), 41.5388, 2.4449, 150);

select tests.authenticate_as('alfa');

select isnt(
  public.check_in_here((select id from festa), 41.5388, 2.4449, 10)->>'estat',
  'no_hi_es',
  'i una festa al mateix punt i a la mateixa hora si que entra, o les de sobre no provarien res'
);

-- ── i la quarta: qui ha dit que si ──────────────────────────────────────────
-- `att_select_public_si` deixava llegir qui havia dit que si a qualsevol
-- esdeveniment publicat, i amb l'identificador d'una reunio de junta aixo es
-- la llista de qui hi ha a la junta i qui hi sera. Publicat i visible eren el
-- mateix fins que van existir les reunions.
reset role;

-- `do update`, perque les proves de tancar-les d'aqui dalt ja han deixat files
-- d'aquesta persona a les dues reunions.
insert into public.attendances (user_id, event_id, estado) values
  ('00000000-0000-4000-8000-0000000000a1', (select junta from que), 'si'),
  ('00000000-0000-4000-8000-0000000000a1', (select comi from que), 'si')
on conflict (user_id, event_id) do update set estado = 'si';

select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.attendances
    where event_id = (select junta from que)),
  0,
  'un soci no llegeix qui ha dit que si a una reunio de junta'
);

-- Per aquesta fila i no pel total: les proves de tancar-les d'aqui dalt ja han
-- deixat gent marcada a la reunio de la comi.
select is(
  (select count(*)::int from public.attendances
    where event_id = (select comi from que)
      and user_id = '00000000-0000-4000-8000-0000000000a1'),
  1,
  'i a una de la comi si, que es el que fa el recompte de qui hi sera'
);

select throws_ok(
  format(
    $$insert into public.attendances (user_id, event_id, estado)
      values (%L, %L, 'si')$$,
    '00000000-0000-4000-8000-000000000001', (select junta from que)
  ),
  '42501',
  null,
  'ni s''hi pot apuntar: WITH CHECK aixeca, no filtra'
);

-- ── les tanques que va trobar l'auditoria de producció ──────────────────────
-- Totes tres son la mateixa confusio: fins que van existir les reunions,
-- «publicat» i «revelat» volien dir «visible». Una reunio no te reveal_at, o
-- sigui que qualsevol predicat que nomes miri la revelacio la deixa passar.
reset role;

-- Els cotxes. Amb `te_cotxes` posat a la reunio de junta, un soci de fora en
-- llegia els cotxes i qui hi puja: qui es de la junta i qui hi va.
update public.events set te_cotxes = true where id = (select junta from que);

insert into public.rides (id, event_id, driver_id, sentit, origen, places)
values (
  '00000000-0000-4000-8000-0000000000fd',
  (select junta from que),
  '00000000-0000-4000-8000-0000000000a1',
  'anada', 'Un lloc inventat', 3
);

select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.rides where event_id = (select junta from que)),
  0,
  'un soci no veu els cotxes d''una reunio de junta'
);

select is(
  (select count(*)::int from public.ride_seats s
     join public.rides r on r.id = s.ride_id
    where r.event_id = (select junta from que)),
  0,
  'ni els seients, que van per private.ride_is_visible'
);

select throws_ok(
  format(
    $$insert into public.rides (event_id, driver_id, sentit, origen, places)
      values (%L, %L, 'anada', 'Un altre lloc inventat', 2)$$,
    (select junta from que), '00000000-0000-4000-8000-000000000001'
  ),
  '42501',
  null,
  'ni s''hi pot oferir per portar-hi ningu'
);

-- L'interes: una reunio no es teasereja, pero la fila es podia escriure
-- sabent l'identificador.
select throws_ok(
  format(
    $$insert into public.event_interest (event_id, user_id) values (%L, %L)$$,
    (select junta from que), '00000000-0000-4000-8000-000000000001'
  ),
  '42501',
  null,
  'ni dir que hi esta pendent, que d''una reunio no vol dir res'
);

-- I la reunio de la comi segueix funcionant, o les de sobre passarien per la
-- rao equivocada.
reset role;
update public.events set te_cotxes = true where id = (select comi from que);

insert into public.rides (id, event_id, driver_id, sentit, origen, places)
values (
  '00000000-0000-4000-8000-0000000000fe',
  (select comi from que),
  '00000000-0000-4000-8000-0000000000a1',
  'anada', 'Un lloc inventat de la comi', 3
);

select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.rides where event_id = (select comi from que)),
  1,
  'i a una reunio de tota la comi si que es veuen, que es el control'
);

-- ── EL CONTROL QUE FALTAVA A L'ALTRE COSTAT ─────────────────────────────────
-- Les assercions de dalt proven que el forat esta tapat. Aquesta prova que la
-- porta s'obre, i es la que no hi era: la tanca de la migracio 50 bloquejava
-- tothom, i com que `attendances` no te cap politica d'INSERT per a
-- administradors, la junta va quedar tancada fora de la seva propia reunio.
-- Premer «Hi sere» no escrivia res i la pantalla no deia res.
reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format(
    $$insert into public.attendances (user_id, event_id, estado)
      values (%L, %L, 'si')
      on conflict (user_id, event_id) do update set estado = 'si'$$,
    '00000000-0000-4000-8000-0000000000a1', (select junta from que)
  ),
  'qui es convocat a una reunio de junta hi pot contestar'
);

select lives_ok(
  format(
    $$update public.attendances set estado = 'no'
       where user_id = %L and event_id = %L$$,
    '00000000-0000-4000-8000-0000000000a1', (select junta from que)
  ),
  'i pot canviar la resposta, que es el mateix boto una segona vegada'
);

reset role;

select is(
  (select estado from public.attendances
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and event_id = (select junta from que)),
  'no',
  'i el canvi hi queda'
);

-- El soci de fora segueix refusat: la tanca no s'ha obert, s'ha fet precisa.
select tests.authenticate_as('alfa');

select throws_ok(
  format(
    $$insert into public.attendances (user_id, event_id, estado)
      values (%L, %L, 'si')$$,
    '00000000-0000-4000-8000-000000000001', (select junta from que)
  ),
  '42501',
  null,
  'mentre que qui no hi es convocat segueix fora'
);

reset role;

select * from finish();
rollback;

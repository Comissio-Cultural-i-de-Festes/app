-- Fitxar per ubicació.
--
-- Les dues assercions que aguanten el fitxer: que la distància decideix de
-- debò, i que el marge de precisió que declara el mòbil té un topall. Sense el
-- topall, dir «tinc una precisió de cinc quilòmetres» seria fitxar des de casa.
--
-- Coordenades inventades i mar endins a posta: no hi ha cap lloc real en cap
-- fixture d'aquest repo.

begin;
select plan(28);

reset role;

create temporary table who as
select
  tests.uid('alfa')       as alfa,
  tests.uid('bravo')      as bravo,
  tests.uid('junta_alfa') as junta,
  tests.uid('pendent_alfa') as pendent;
grant select on who to authenticated;

-- Un esdeveniment que passa ara mateix, i un altre sense coordenades.
create temporary table what as
select
  '00000000-0000-4000-8000-0000000000c1'::uuid as ara,
  '00000000-0000-4000-8000-0000000000c2'::uuid as sense_lloc,
  '00000000-0000-4000-8000-0000000000c3'::uuid as demà;
grant select on what to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values
  ((select ara from what),'fiesta',now() - interval '1 hour',10,true),
  ((select sense_lloc from what),'fiesta',now() - interval '1 hour',10,true),
  ((select demà from what),'fiesta',now() + interval '7 days',10,true);

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ((select ara from what), 'Festa Inventada'),
  ((select sense_lloc from what), 'Festa Sense Punt'),
  ((select demà from what), 'Festa d''Aqui a Una Setmana')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, ends_at) values
  ((select ara from what), now() + interval '3 hours')
on conflict (event_id) do update set
  ends_at = excluded.ends_at;

-- 40 N, 1 E: mar obert. Un grau de latitud són 111,32 km, o sigui que els
-- desplaçaments de sota són metres comptats i no aproximacions maques.
insert into private.event_geo (event_id, lat, lng, radi_m) values
  ((select ara from what),  40.0, 1.0, 150),
  ((select demà from what), 40.0, 1.0, 150);

-- ── la fórmula ──────────────────────────────────────────────────────────────
select ok(
  private.distance_m(40.0, 1.0, 40.0, 1.0) = 0,
  'dos punts iguals són zero metres i no un domini fora de rang'
);

select ok(
  private.distance_m(40.0, 1.0, 40.0018, 1.0)::int between 190 and 210,
  'i 0,0018 graus de latitud són uns dos-cents metres'
);

-- ── qui pot fitxar ──────────────────────────────────────────────────────────
select tests.authenticate_as('pendent_alfa');

select throws_ok(
  format('select public.check_in_here(%L, 40.0, 1.0)', (select ara from what)),
  '42501',
  null,
  'qui encara no és soci actiu no pot fitxar'
);

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  format('select public.check_in_here(%L, null, null)', (select ara from what)),
  '22023',
  null,
  'i sense coordenades tampoc'
);

-- ── el lloc ─────────────────────────────────────────────────────────────────
select is(
  public.check_in_here((select sense_lloc from what), 40.0, 1.0) ->> 'estat',
  'sense_lloc',
  'un esdeveniment sense punt al mapa ho diu, en comptes de deixar entrar tothom'
);

select is(
  public.check_in_here((select ara from what), 40.0764, 1.0) ->> 'estat',
  'lluny',
  'a vuit quilòmetres i mig, no'
);

select cmp_ok(
  (public.check_in_here((select ara from what), 40.0764, 1.0) ->> 'metres')::int,
  '>', 8000,
  'i el veredicte diu quants metres, que és el que la pantalla ha d''ensenyar'
);

select is(
  public.check_in_here((select ara from what), 40.0018, 1.0) ->> 'estat',
  'lluny',
  'a dos-cents metres amb un radi de cent cinquanta, tampoc'
);

-- El marge del propi mòbil: dins d'un edifici el GPS dóna entre vint i cent
-- metres, i sense comptar-ho hi hauria gent dreta a la sala fora del radi.
select is(
  public.check_in_here((select ara from what), 40.0018, 1.0, 100) ->> 'estat',
  'fet',
  'els mateixos dos-cents metres amb cent de precisió declarada, sí'
);

-- ── el topall del marge ─────────────────────────────────────────────────────
reset role;
delete from public.attendances where user_id = (select alfa from who);
select tests.authenticate_as('alfa');

select is(
  public.check_in_here((select ara from what), 40.00898, 1.0, 5000) ->> 'estat',
  'lluny',
  'declarar cinc quilòmetres de precisió no et guanya el fitxatge des d''un quilòmetre'
);

-- ── la finestra ─────────────────────────────────────────────────────────────
select is(
  public.check_in_here((select demà from what), 40.0, 1.0) ->> 'estat',
  'tancat',
  'una setmana abans encara no s''hi pot fitxar'
);

select isnt(
  public.check_in_here((select demà from what), 40.0, 1.0) ->> 'obre',
  null,
  'i el veredicte porta quan s''obre, perquè la pantalla ho pugui dir'
);

-- Una hora declarada al futur no serveix per obrir-la abans d'hora.
select is(
  public.check_in_here(
    (select demà from what), 40.0, 1.0, null, null, now() + interval '7 days'
  ) ->> 'estat',
  'tancat',
  'i una hora declarada al futur no obre la finestra'
);

-- ── fitxar de debò ──────────────────────────────────────────────────────────
select is(
  public.check_in_here((select ara from what), 40.0, 1.0, 12) ->> 'estat',
  'fet',
  'al lloc i a l''hora, s''hi fitxa'
);

select is(
  (public.check_in_here((select ara from what), 40.0, 1.0) ->> 'estat'),
  'ja_hi_ets',
  'i dues vegades no'
);

reset role;

select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = (select ara from what)),
  'asistio',
  'la fila queda com a asistio'
);

select is(
  (select checkin_via from public.attendances
    where user_id = (select alfa from who) and event_id = (select ara from what)),
  'ubicacio',
  'amb la via desada'
);

select cmp_ok(
  (select checkin_dist_m from public.attendances
    where user_id = (select alfa from who) and event_id = (select ara from what))::int,
  '<', 5,
  'i els metres que va calcular el servidor, no els que va dir el mòbil'
);

select is(
  (select count(*)::int from public.points_log
    where user_id = (select alfa from who) and event_id = (select ara from what)
      and motivo = 'asistencia'),
  1,
  'i els punts, un sol cop'
);

-- ── la cua sense cobertura no paga dues vegades ─────────────────────────────
create temporary table req as select gen_random_uuid() as id;
grant select on req to authenticated;

select tests.authenticate_as('bravo');

select is(
  public.check_in_here(
    (select ara from what), 40.0, 1.0, null, (select id from req)
  ) ->> 'estat',
  'fet',
  'un altre soci hi fitxa'
);

reset role;
delete from public.attendances
 where user_id = (select bravo from who) and event_id = (select ara from what);
select tests.authenticate_as('bravo');

-- La fila ha marxat però el punt no: reenviar el mateix id no n'ha de pagar un
-- altre, que és el que fa segura la cua d'IndexedDB.
select is(
  public.check_in_here(
    (select ara from what), 40.0, 1.0, null, (select id from req)
  ) ->> 'estat',
  'fet',
  'i el reenviament de la cua torna a entrar'
);

reset role;

select is(
  (select count(*)::int from public.points_log
    where user_id = (select bravo from who) and event_id = (select ara from what)
      and motivo = 'asistencia'),
  1,
  'sense pagar el punt dues vegades'
);

-- ── treure'n un ─────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

-- `admin_undo_checkin` retorna void: el que s'ha de mirar és què deixa, no què
-- diu.
select lives_ok(
  format(
    'select public.admin_undo_checkin(%L, %L)',
    (select ara from what), (select alfa from who)
  ),
  'la junta el pot treure amb el que ja hi havia des de la migració 23'
);

reset role;

select is(
  (select count(*)::int from public.points_log
    where user_id = (select alfa from who) and event_id = (select ara from what)
      and motivo = 'asistencia'),
  0,
  'i els punts se''n van amb ell'
);

-- ── qui veu on és l'esdeveniment ────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  'select lat from private.event_geo limit 1',
  '42501',
  null,
  'un soci no pot llegir on és cap esdeveniment'
);

select is(
  (select count(*)::int from public.admin_event_geo((select ara from what))),
  0,
  'ni per la funció de la junta'
);

select is(
  (select count(*)::int from public.admin_checkins((select ara from what))),
  0,
  'ni la llista de fitxatges'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select radi_m from public.admin_event_geo((select ara from what))),
  150,
  'i la junta sí'
);

reset role;
select * from finish();
rollback;

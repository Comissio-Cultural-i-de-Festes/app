-- Les quatre portes per les quals un soci arribava a una reunió de junta.
--
-- LA MIGRACIÓ 56 LES TANCA amb `private.event_is_visible_to_caller()`. Aquest
-- fitxer les prova UNA PER UNA I PER PARELLES: el soci de fora ha de rebre el
-- refús, i la junta ha de seguir podent. Sense la segona meitat les assercions
-- passarien igual si la tanca fos massa ampla, que és el que va costar la
-- migració 54 —la 50 va tancar la junta fora de la seva pròpia reunió i cap
-- test ho va veure, perquè tots miraven el costat negatiu—.
--
-- LA TERCERA MEITAT, i és la que fa que això no sigui una tautologia: cada
-- porta es prova també sobre una FESTA normal. Si una tanca es passés de
-- llarga, el que es trencaria és la galeria de la festa, no la de la reunió, i
-- no hi ha cap pantalla on això es vegi de seguida.
--
-- Els UUID van escrits sencers a les assercions de seguretat.
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(21);

reset role;

-- ── El món de la prova ──────────────────────────────────────────────────────
--
-- `e9` és la reunió d'àmbit junta que ja porta el seed; `e1` és la festa
-- publicada i revelada. Cap de les dues té fotos, cotxes ni contingut, així que
-- se'n posa un de cada a cadascuna: sense la parella, «no es veu» no distingeix
-- una tanca que funciona d'una taula buida.

create temporary table mon as
select
  '00000000-0000-4000-8000-0000000000e9'::uuid as reunio,
  '00000000-0000-4000-8000-0000000000e1'::uuid as festa,
  '00000000-0000-4000-8000-0000aaab0001'::uuid as cotxe_reunio,
  '00000000-0000-4000-8000-0000aaab0002'::uuid as cotxe_festa;
grant select on mon to authenticated;

insert into public.event_photos (event_id, user_id, path, thumb_path) values
  ((select reunio from mon), '00000000-0000-4000-8000-0000000000a1',
   'auditoria/reunio.jpg', 'auditoria/reunio-thumb.jpg'),
  ((select festa from mon), '00000000-0000-4000-8000-0000000000a1',
   'auditoria/festa.jpg', 'auditoria/festa-thumb.jpg');

insert into public.rides (id, event_id, driver_id, sentit, origen, places) values
  ((select cotxe_reunio from mon), (select reunio from mon),
   '00000000-0000-4000-8000-0000000000a2', 'anada', 'Punt Alfa', 3),
  ((select cotxe_festa from mon), (select festa from mon),
   '00000000-0000-4000-8000-0000000000a2', 'anada', 'Punt Alfa', 3);

insert into public.event_content (event_id, tipus, titol, cos, visible_from) values
  ((select reunio from mon), 'text', 'AUDIT acta de la junta', '{"text":"cos"}'::jsonb, now() - interval '1 day'),
  ((select festa from mon), 'text', 'AUDIT cartell de la festa', '{"text":"cos"}'::jsonb, now() - interval '1 day');

-- ── Porta 1: la galeria ─────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.event_photos where event_id = (select reunio from mon)),
  0,
  'la política de fotos no deixa veure la galeria d''una reunió de junta'
);

select is(
  (select count(*)::int from public.event_photos(( select reunio from mon))),
  0,
  'ni la RPC event_photos'
);

select is(
  (select quantes from public.event_photo_count((select reunio from mon))),
  0,
  'ni el comptador event_photo_count'
);

select is(
  (select count(*)::int from public.event_photos(( select festa from mon))),
  1,
  'i la galeria d''una festa normal segueix veient-se'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select count(*)::int from public.event_photos where event_id = (select reunio from mon)),
  1,
  'la junta sí que veu la galeria de la seva reunió'
);

select is(
  (select count(*)::int from public.event_photos(( select reunio from mon))),
  1,
  'i també per la RPC'
);

select is(
  (select quantes from public.event_photo_count((select reunio from mon))),
  1,
  'i el comptador li diu que n''hi ha una'
);

-- ── Porta 2: els cotxes ─────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select is(
  (select public.join_ride((select cotxe_reunio from mon)) ->> 'estat'),
  'no_hi_es',
  'un soci de fora no pot ocupar seient al cotxe d''una reunió de junta'
);

select is(
  (select count(*)::int from public.ride_seats
    where ride_id = (select cotxe_reunio from mon)
      and user_id = '00000000-0000-4000-8000-000000000001'),
  0,
  'i no ha quedat cap fila escrita'
);

select is(
  (select public.join_ride((select cotxe_festa from mon)) ->> 'estat'),
  'a_dins',
  'i al cotxe d''una festa normal hi entra'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select public.join_ride((select cotxe_reunio from mon)) ->> 'estat'),
  'a_dins',
  'la junta sí que puja al cotxe de la seva reunió'
);

-- Qui es pot convidar. El conductor és de la junta, així que la pregunta és
-- sobre la persona convidada i no sobre qui crida.
reset role;
select tests.authenticate_as('junta_bravo');

select is_empty(
  $$ select 1 from public.ride_candidates('00000000-0000-4000-8000-0000aaab0001')
      where user_id = '00000000-0000-4000-8000-000000000001' $$,
  'ride_candidates no ofereix socis de fora per a una reunió de junta'
);

select isnt_empty(
  $$ select 1 from public.ride_candidates('00000000-0000-4000-8000-0000aaab0001') $$,
  'però ofereix la junta, o el botó no serviria de res'
);

select is(
  (select public.invite_to_ride(
     (select cotxe_reunio from mon),
     '00000000-0000-4000-8000-000000000001') ->> 'estat'),
  'no_hi_es',
  'no es pot guardar seient a un soci de fora en una reunió de junta'
);

select is(
  (select public.invite_to_ride(
     (select cotxe_reunio from mon),
     '00000000-0000-4000-8000-0000000000a3') ->> 'estat'),
  'convidat',
  'i a algú de la junta sí'
);

-- ── Porta 3: l'interès ──────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-0000000000e9', true) $$,
  'P0002',
  null,
  'un soci de fora no pot dir «avisa''m» d''una reunió de junta'
);

-- El mateix codi que un esdeveniment que no existeix. Si fossin diferents,
-- l'error diria quines reunions de junta hi ha.
select throws_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-00000000dead', true) $$,
  'P0002',
  null,
  'i el codi és el mateix que per a un esdeveniment inexistent'
);

select lives_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-0000000000e1', true) $$,
  'i d''una festa normal sí que en pot dir'
);

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-0000000000e9', true) $$,
  'la junta sí que pot dir-ho de la seva reunió'
);

-- ── Porta 4: el contingut ───────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.event_content
    where event_id = (select reunio from mon) and titol like 'AUDIT%'),
  0,
  'l''acta d''una reunió de junta no la llegeix un soci de fora'
);

select is(
  (select count(*)::int from public.event_content
    where event_id = (select festa from mon) and titol like 'AUDIT%'),
  1,
  'i el contingut d''una festa normal sí'
);

select * from finish();
rollback;

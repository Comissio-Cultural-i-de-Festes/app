-- Enough of an association for the screens to look like themselves.
--
-- LOCAL AND CI ONLY, same as 10_demo_data.sql, and under the same rule:
-- obviously synthetic, never plausible-but-fake. NATO handles, @example.test
-- addresses, invented venues.
--
-- 10_demo_data.sql exists to exercise the policies and is deliberately small:
-- one row per visibility case. That is the wrong shape for looking at a
-- leaderboard or a home screen, where three people and four points hides every
-- layout problem there is — an avatar stack of two, a school table where every
-- school is tied, a "què més ve" list with one row in it.
--
-- Nothing here touches the fixtures the policy tests assert on. New people, new
-- events, and points on those events only.

-- ── more of an association ──────────────────────────────────────────────────
select tests.create_user('india',    '00000000-0000-4000-8000-0000000000d1', 'member', 'actiu', 'politecnica');
select tests.create_user('juliett',  '00000000-0000-4000-8000-0000000000d2', 'member', 'actiu', 'empresa');
select tests.create_user('kilo',     '00000000-0000-4000-8000-0000000000d3', 'member', 'actiu', 'salut');
select tests.create_user('lima',     '00000000-0000-4000-8000-0000000000d4', 'member', 'actiu', 'politecnica');
select tests.create_user('mike',     '00000000-0000-4000-8000-0000000000d5', 'member', 'actiu', 'empresa');
select tests.create_user('november', '00000000-0000-4000-8000-0000000000d6', 'member', 'actiu', 'salut');
select tests.create_user('oscar',    '00000000-0000-4000-8000-0000000000d7', 'member', 'actiu', 'politecnica');
select tests.create_user('papa',     '00000000-0000-4000-8000-0000000000d8', 'member', 'actiu', 'empresa');
select tests.create_user('quebec',   '00000000-0000-4000-8000-0000000000d9', 'member', 'actiu', 'salut');
select tests.create_user('romeo',    '00000000-0000-4000-8000-0000000000da', 'member', 'actiu', 'politecnica');
select tests.create_user('sierra',   '00000000-0000-4000-8000-0000000000db', 'member', 'actiu', 'empresa');
select tests.create_user('tango',    '00000000-0000-4000-8000-0000000000dc', 'member', 'actiu', 'salut');

-- ── events ──────────────────────────────────────────────────────────────────
-- e5 already happened, which is what the home screen's "l'última vegada" block
-- reads. Without one, that whole block is invisible in development and nobody
-- notices it is broken until the second event of the year.
insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, teaser, reveal_at, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000e5','fiesta',now() - interval '45 days',null,0,15,'Es va acabar be',now() - interval '55 days',true,'00000000-0000-4000-8000-0000000000a1');

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ('00000000-0000-4000-8000-0000000000e5', 'Cloenda Alfa')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, descripcion, ubicacion)
values ('00000000-0000-4000-8000-0000000000e5', 'Descripcio Cloenda', 'Sala Alfa')
on conflict (event_id) do update set
  descripcion = excluded.descripcion,
  ubicacion = excluded.ubicacion;

-- e6 is the one with places filling up, so the "queden N places" number has
-- something to say.
insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, teaser, reveal_at, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000e6','actividad',now() + interval '9 days',24,0,10,'Per equips de quatre',now() - interval '2 days',true,'00000000-0000-4000-8000-0000000000a2');

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ('00000000-0000-4000-8000-0000000000e6', 'Quiz Bravo')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, descripcion, ubicacion)
values ('00000000-0000-4000-8000-0000000000e6', 'Descripcio Quiz', 'Bar Bravo')
on conflict (event_id) do update set
  descripcion = excluded.descripcion,
  ubicacion = excluded.ubicacion;

-- e7 has not been revealed, so the list row shows a teaser and nothing else.
insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, teaser, reveal_at, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000e7','casa_rural',now() + interval '22 days',16,5500,30,'Ja ho sabras',now() + interval '15 days',true,'00000000-0000-4000-8000-0000000000a1');

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ('00000000-0000-4000-8000-0000000000e7', 'Alguna cosa el mes que ve')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, descripcion, ubicacion, transport_info)
values ('00000000-0000-4000-8000-0000000000e7', 'Descripcio secreta', 'Casa Charlie', 'Cotxe compartit')
on conflict (event_id) do update set
  descripcion = excluded.descripcion,
  ubicacion = excluded.ubicacion,
  transport_info = excluded.transport_info;

-- ── who came to the one that already happened ───────────────────────────────
insert into public.attendances (user_id, event_id, estado, checked_in_at, checked_in_by, was_registered)
select
  p.id,
  '00000000-0000-4000-8000-0000000000e5',
  'asistio',
  now() - interval '45 days',
  '00000000-0000-4000-8000-0000000000a1',
  true
from public.profiles p
where p.estat = 'actiu' and p.escola is not null
  and p.id <> '00000000-0000-4000-8000-0000000000d9';

insert into public.points_log (user_id, event_id, motivo, puntos, granted_by, created_at)
select a.user_id, a.event_id, 'asistencia', 15,
       '00000000-0000-4000-8000-0000000000a1', now() - interval '45 days'
from public.attendances a
where a.event_id = '00000000-0000-4000-8000-0000000000e5';

-- ── who is coming to the next ones ──────────────────────────────────────────
-- Two of these were entered today, which is what the pulsing "s'han apuntat
-- avui" line on the home screen counts.
--
-- Clamped to the start of today rather than a flat "three hours ago", because
-- resetting the database at one in the morning would put both of them
-- yesterday and the line would silently not appear. And today means today in
-- Europe/Madrid, which is where the screen computes it: date_trunc on a bare
-- now() is midnight UTC, two hours late in summer, so between midnight and two
-- it is still yesterday as far as the database is concerned.
insert into public.attendances (user_id, event_id, estado, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e1', 'si', greatest(now() - interval '3 hours', tests.today_local())),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e1', 'si', greatest(now() - interval '5 hours', tests.today_local())),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e1', 'si', now() - interval '9 days'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e1', 'si', now() - interval '8 days'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000e1', 'si', now() - interval '7 days'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000e1', 'potser', now() - interval '6 days'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000e1', 'si', now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000e1', 'si', now() - interval '2 days');

insert into public.attendances (user_id, event_id, estado, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e6', 'si', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e6', 'si', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000e6', 'si', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000e6', 'si', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000e6', 'si', now() - interval '4 hours');

insert into public.attendances (user_id, event_id, estado, created_at) values
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e4', 'si', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000e4', 'si', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000e4', 'si', now() - interval '1 day');

-- ── a spread of points, so no two people are tied at the top ────────────────
-- Dated to the last fortnight, which is what gives the ranking's weekly
-- movement column something to show. All of it hangs off e5 and e6, so nothing
-- here lands on the fixtures the policy tests count.
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e6', 'montaje', 40, '00000000-0000-4000-8000-0000000000a1', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000e6', 'montaje', 35, '00000000-0000-4000-8000-0000000000a1', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000e6', 'trajo_gente', 25, '00000000-0000-4000-8000-0000000000a1', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000e6', 'trajo_gente', 30, '00000000-0000-4000-8000-0000000000a1', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-0000000000e5', 'montaje', 20, '00000000-0000-4000-8000-0000000000a1', now() - interval '44 days'),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000e5', 'trajo_gente', 10, '00000000-0000-4000-8000-0000000000a1', now() - interval '44 days'),
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000e6', 'montaje', 45, '00000000-0000-4000-8000-0000000000a1', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000e6', 'trajo_gente', 15, '00000000-0000-4000-8000-0000000000a1', now() - interval '4 days'),
  ('00000000-0000-4000-8000-0000000000dc', '00000000-0000-4000-8000-0000000000e5', 'montaje', 5, '00000000-0000-4000-8000-0000000000a1', now() - interval '44 days');

-- ── dues reunions, per veure'n els dos àmbits ────────────────────────────────
-- La de la comi surt a l'Inici de tothom amb la fila grisa i el xip; la de la
-- junta no surt enlloc més que al panell, i és la que fa que es pugui comprovar
-- —mirant-ho, no deduint-ho— que un soci no hi arriba ni sabent-ne l'enllaç.
--
-- SENSE `reveal_at`: una reunió no es teasereja. Es convoca, i qui l'ha de
-- veure la veu de seguida.
--
-- La de junta va amb `puntos = 0` perquè és el que la RPC hi posaria: una
-- reunió de junta no reparteix punts ni toca cap ratxa, que seria injust per a
-- qui no és de la junta i no hi pot anar.
insert into public.events (id, tipo, abast, starts_at, plazas, precio_cents, puntos, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000e8','reunio','comi',
   now() + interval '4 days', null, 0, 5, true, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000e9','reunio','junta',
   now() + interval '2 days', null, 0, 0, true, '00000000-0000-4000-8000-0000000000a1');

insert into public.event_title (event_id, titulo) values
  ('00000000-0000-4000-8000-0000000000e8', 'Assemblea de la comi'),
  ('00000000-0000-4000-8000-0000000000e9', 'Junta de dimarts');

insert into public.event_details (event_id, descripcion, ubicacion) values
  ('00000000-0000-4000-8000-0000000000e8', 'Ordre del dia: el trimestre que ve', 'Aula 1.3'),
  ('00000000-0000-4000-8000-0000000000e9', 'Comptes i calendari', 'Aula 0.1');

-- Uns quants sí a la de la comi, perquè el recompte no surti a zero.
insert into public.attendances (user_id, event_id, estado, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000e8', 'si', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000e8', 'si', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-0000000000e8', 'no', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e9', 'si', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000e9', 'si', now() - interval '6 hours');

-- ── dues coses ja fetes, dins del curs, amb hores ───────────────────────────
-- Sense això el comptador d'hores del perfil surt a zero en local i no
-- demostraria res: l'únic esdeveniment passat que hi havia és l'e5, que cau
-- quaranta-cinc dies enrere i per tant sovint fora de la finestra del curs.
--
-- L'hora d'inici es fixa a deu dies enrere, però mai abans que comenci el curs
-- de `ranking_periods` —que el setembre pot haver començat fa quatre dies— i
-- sempre en passat. Si no, segons el dia que algú fes el reset, l'activitat
-- cauria fora de la finestra i el bloc tornaria a sortir buit.
--
-- N'hi ha dues i no una perquè `private.minuts_persona` té tres camins i s'han
-- de poder veure tots: qui fitxa i no es fa la foto de sortida, qui arriba tard,
-- qui se'n va aviat, i qui no té cap marca perquè la reunió es va tancar des del
-- panell i allà no fitxa ningú.
insert into public.events (id, tipo, abast, starts_at, plazas, precio_cents, puntos, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000ea', 'actividad', 'comi',
   greatest(
     now() - interval '10 days',
     coalesce(
       (select rp.starts_at from public.ranking_periods rp
         where rp.mena = 'global' order by rp.ordre, rp.codi limit 1),
       now() - interval '10 days'
     ) + interval '2 hours'
   ),
   null, 0, 10, true, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000eb', 'reunio', 'comi',
   greatest(
     now() - interval '6 days',
     coalesce(
       (select rp.starts_at from public.ranking_periods rp
         where rp.mena = 'global' order by rp.ordre, rp.codi limit 1),
       now() - interval '6 days'
     ) + interval '3 hours'
   ),
   null, 0, 5, true, '00000000-0000-4000-8000-0000000000a1');

update public.events set tancada_at = starts_at + interval '2 hours'
 where id = '00000000-0000-4000-8000-0000000000eb';

insert into public.event_title (event_id, titulo) values
  ('00000000-0000-4000-8000-0000000000ea', 'Taller de cartells'),
  ('00000000-0000-4000-8000-0000000000eb', 'Assemblea de setembre')
on conflict (event_id) do update set titulo = excluded.titulo;

-- Amb hora de final, que és el que fa que les hores surtin de l'horari i no
-- del valor per defecte del tipus. Quatre hores el taller, hora i mitja
-- l'assemblea.
insert into public.event_details (event_id, descripcion, ubicacion, ends_at)
select e.id,
       case e.id when '00000000-0000-4000-8000-0000000000ea'
                 then 'Pintar els cartells del trimestre'
                 else 'Ordre del dia: el curs que comenca' end,
       case e.id when '00000000-0000-4000-8000-0000000000ea'
                 then 'Aula 2.1' else 'Aula 1.3' end,
       e.starts_at + case e.id when '00000000-0000-4000-8000-0000000000ea'
                               then interval '4 hours'
                               else interval '90 minutes' end
  from public.events e
 where e.id in ('00000000-0000-4000-8000-0000000000ea',
                '00000000-0000-4000-8000-0000000000eb')
on conflict (event_id) do update set
  descripcion = excluded.descripcion,
  ubicacion   = excluded.ubicacion,
  ends_at     = excluded.ends_at;

-- Al taller hi va fitxar gent, i a hores diferents a posta.
insert into public.attendances (
  user_id, event_id, estado, checked_in_at, checked_in_by, was_registered, exit_photo_at
)
select q.user_id,
       '00000000-0000-4000-8000-0000000000ea',
       'asistio',
       e.starts_at + q.entra,
       '00000000-0000-4000-8000-0000000000a1',
       true,
       case when q.surt is null then null else e.starts_at + q.surt end
  from public.events e,
       (values
          -- Hi va ser de cap a cap: les quatre hores.
          ('00000000-0000-4000-8000-000000000001'::uuid, interval '0 minutes',  interval '4 hours'),
          -- Va arribar a la meitat: dues.
          ('00000000-0000-4000-8000-0000000000d1'::uuid, interval '2 hours',    interval '4 hours'),
          -- Hi era des del principi i va marxar a l'hora i mitja.
          ('00000000-0000-4000-8000-0000000000d2'::uuid, interval '0 minutes',  interval '90 minutes'),
          -- I la que fa falta per veure el guionet: va entrar i no es va fer la
          -- foto de sortida, o sigui que no se sap quanta estona hi va ser.
          ('00000000-0000-4000-8000-0000000000d3'::uuid, interval '30 minutes', null::interval)
       ) as q(user_id, entra, surt)
 where e.id = '00000000-0000-4000-8000-0000000000ea'
on conflict (user_id, event_id) do nothing;

-- A l'assemblea no hi va fitxar ningú, perquè una reunió es tanca des del
-- panell i allà no hi ha porta. Tothom qui hi consta fa l'hora i mitja sencera.
insert into public.attendances (user_id, event_id, estado)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000eb', 'asistio'),
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000eb', 'asistio'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000eb', 'asistio')
on conflict (user_id, event_id) do nothing;

-- ── i el que `admin_save_event` hauria escrit en crear-los ──────────────────
-- La llavor insereix a `events` directament, o sigui que aquestes dues columnes
-- es quedarien al valor per defecte i tot valdria zero hores. Això és el mateix
-- càlcul que fa la RPC, i per tant les mateixes dues funcions: si algun dia el
-- defecte canvia, la llavor el segueix sola.
update public.events e
   set a_la_uni       = private.memoria_a_la_uni_defecte(e.tipo),
       minuts_memoria = private.memoria_minuts(
                          e.tipo, e.starts_at,
                          (select d.ends_at from public.event_details d where d.event_id = e.id)
                        );

-- El taller ja està visat i l'assemblea no: així al perfil es veuen les dues
-- cares del bloc, la xifra tancada i la provisional.
update public.events
   set hores_verificat_at  = now() - interval '2 days',
       hores_verificat_per = '00000000-0000-4000-8000-0000000000a1'
 where id = '00000000-0000-4000-8000-0000000000ea';

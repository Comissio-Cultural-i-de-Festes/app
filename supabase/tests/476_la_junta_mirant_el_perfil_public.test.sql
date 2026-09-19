-- «On ha estat» del perfil públic, mirat per algú de la junta.
--
-- PER QUÈ AQUEST FITXER. La 475 fixa que una reunió amb `abast = 'junta'` no
-- surt a «ON HA ESTAT», i la fixa bé: la seva asserció mossega. El que no fa
-- —ni ella ni `tests/rls/member.test.ts`— és preguntar-ho amb un token de la
-- junta. Totes dues autentiquen un soci ras, i `att_select_public_si` no és
-- l'única política de lectura d'`attendances`: hi ha `att_select_admin`, que
-- publica tota fila a qui compleix `private.is_admin()`, i `events_select_admin`,
-- que fa el mateix amb els esdeveniments. Amb les dues alhora, la reunió de
-- junta torna sencera —amb el títol— per la consulta literal de
-- `fetchMemberNights()`.
--
-- QUÈ AFIRMA AQUEST FITXER. Que la regla és de la pantalla i no del qui mira:
-- `/soci/:id` és el perfil públic, i la frase que duu a sota quan és el teu
-- —«això és el que qualsevol soci veu de tu»— només és certa si la llista és
-- la mateixa per a tothom. `public.member_badges()` ja ho resol així: és
-- `definer` i tapa el títol d'una reunió de junta a qualsevol que la cridi,
-- també a un admin. La llista de nits no ho fa, perquè no passa per cap funció.
--
-- EL CONTROL POSITIU HI ÉS PER PARELLES, com demana el capçal de la 370: de
-- cada cas se'n comprova també la reunió de la comi, perquè el dia que la
-- consulta deixés de tornar res aquest fitxer seguiria verd dient que la junta
-- està tapada.
--
-- Gent i reunions inventades, com a tot el repositori.

begin;
select plan(6);

reset role;

delete from public.points_log;
delete from public.events;

select tests.create_user('vist_476',  '00000000-0000-4000-8000-00000000d476', 'member', 'actiu', 'politecnica');
select tests.create_user('soci_476',  '00000000-0000-4000-8000-00000000d477', 'member', 'actiu', 'empresa');
select tests.create_user('junta_476', '00000000-0000-4000-8000-00000000d478', 'admin',  'actiu', 'salut');

create temporary table qui476 as
select '00000000-0000-4000-8000-00000000d476'::uuid as vist;
grant select on qui476 to authenticated;

create temporary table que476 as
select '00000000-0000-4000-8000-00000000df76'::uuid as junta,
       '00000000-0000-4000-8000-00000000df77'::uuid as comi;
grant select on que476 to authenticated;

insert into public.events (id, tipo, abast, starts_at, puntos, published, reveal_at)
values
  ((select junta from que476), 'reunio', 'junta', now() - interval '20 days', 0, true, null),
  ((select comi  from que476), 'reunio', 'comi',  now() - interval '19 days', 0, true, null);

insert into public.event_title (event_id, titulo)
values
  ((select junta from que476), 'Reunio tancada inventada'),
  ((select comi  from que476), 'Trobada oberta inventada')
on conflict (event_id) do update set titulo = excluded.titulo;

-- La mateixa fila a totes dues: el que ha de canviar és qui la pot llegir.
insert into public.attendances (user_id, event_id, estado)
values
  ((select vist from qui476), (select junta from que476), 'asistio'),
  ((select vist from qui476), (select comi  from que476), 'asistio');

-- ── 1. el soci ras: el cas que la 475 ja cobreix, aquí com a referència ────

reset role;
select tests.authenticate_as('soci_476');

select is(
  (select count(*)::int from public.attendances a
    where a.user_id = (select vist from qui476)
      and a.event_id = (select junta from que476)),
  0,
  'un soci ras no llegeix la fila de la reunio de junta'
);

select is(
  (select count(*)::int from public.attendances a
    where a.user_id = (select vist from qui476)
      and a.event_id = (select comi from que476)),
  1,
  'i si la de la comi: la consulta torna alguna cosa'
);

-- ── 2. la junta, mirant la mateixa pantalla ───────────────────────────────
-- La consulta de `fetchMemberNights()`, amb l'incrustat que el client filtra:
-- una fila amb `events` a null no arriba a la llista, o sigui que el que
-- compta es si `events` hi es.

reset role;
select tests.authenticate_as('junta_476');

select is(
  (select count(*)::int
     from public.attendances a
     join public.events e on e.id = a.event_id
    where a.user_id = (select vist from qui476)
      and a.estado = 'asistio'
      and e.abast = 'junta'),
  0,
  'i algu de la junta tampoc, mirant el perfil public d''un altre'
);

select is(
  (select count(*)::int
     from public.attendances a
     join public.events e on e.id = a.event_id
    where a.user_id = (select vist from qui476)
      and a.estado = 'asistio'
      and e.abast = 'comi'),
  1,
  'i la de la comi si: el zero de sobre no es que no es vegi res'
);

-- ── 3. i el titol, que es la part que member_badges() ja tapa a tothom ────

select is(
  (select t.titulo
     from public.attendances a
     join public.events e on e.id = a.event_id
     left join public.event_title t on t.event_id = e.id
    where a.user_id = (select vist from qui476)
      and e.abast = 'junta'),
  null::text,
  'el titol d''una reunio de junta no surt per la llista de nits, com no surt per member_badges()'
);

select is(
  (select t.titulo
     from public.attendances a
     join public.events e on e.id = a.event_id
     left join public.event_title t on t.event_id = e.id
    where a.user_id = (select vist from qui476)
      and e.abast = 'comi'),
  'Trobada oberta inventada',
  'i el de la trobada oberta si: el contrast que fa dir alguna cosa al null de sobre'
);

select * from finish();
rollback;

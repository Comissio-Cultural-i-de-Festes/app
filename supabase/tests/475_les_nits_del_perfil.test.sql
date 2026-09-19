-- «On ha estat» no diu mai que algú va anar a una reunió de junta.
--
-- PER QUÈ UN FITXER A PART. La 470 fixa les dues funcions noves del perfil
-- —`member_streak()` i `member_badges()`— i no toca la llista de nits, que és
-- la part de la pantalla que no té cap migració al darrere: surt de
-- `att_select_public_si` i de res més. Aquella política fa dues coses alhora
-- —publicar els «si» i els «asistio» d'una activitat publicada, i deixar fora
-- les reunions amb `abast = 'junta'`— i fins ara la segona no la comprovava
-- ningú: ni la 470, ni `tests/rls/member.test.ts`, que recorre la forma de
-- l'incrustat sobre un soci que no té cap fila en cap reunió de junta. Una
-- regla que no comprova ningú és una regla que el dia que caigui cau en
-- silenci, i aquesta cau ensenyant a tota la comi qui va a les reunions de la
-- junta, que és exactament el que la migració 50 va anar a tapar.
--
-- EL CONTROL POSITIU VA AL COSTAT, com demana el capçal de la 370: una reunió
-- amb `abast = 'comi'` i la mateixa fila `asistio` SÍ que ha de sortir. Sense
-- ell, el dia que la política deixés de publicar res, aquest fitxer seguiria
-- verd i diria que la junta està tapada quan el que passa és que no es veu res.
--
-- I LA SEGONA MEITAT: el títol d'una reunió de junta tampoc no pot sortir per
-- `member_badges()`. La 470 prova el cas d'una activitat encara no revelada
-- —`reveal_at` al futur— però no el d'una que no es revelarà mai perquè no és
-- de la comi, i són dues branques diferents del mateix `case`.
--
-- Gent i reunions inventades, com a tot el repositori.

begin;
select plan(6);

reset role;

-- El calendari, buit: una reunió del seed amb una fila d'algú faria que el
-- conjunt que s'espera a sota depengués de les dades de demostració.
delete from public.points_log;
delete from public.events;

select tests.create_user('nits_mirat', '00000000-0000-4000-8000-00000000d101', 'member', 'actiu', 'politecnica');
select tests.create_user('nits_mira',  '00000000-0000-4000-8000-00000000d102', 'member', 'actiu', 'empresa');

update public.profiles
   set created_at = now() - interval '365 days'
 where id in ('00000000-0000-4000-8000-00000000d101',
              '00000000-0000-4000-8000-00000000d102');

create temporary table qui as
select '00000000-0000-4000-8000-00000000d101'::uuid as mirat,
       '00000000-0000-4000-8000-00000000d102'::uuid as mira;
grant select on qui to authenticated;

create temporary table que as
select '00000000-0000-4000-8000-00000000df01'::uuid as junta,
       '00000000-0000-4000-8000-00000000df02'::uuid as comi,
       '00000000-0000-4000-8000-00000000df03'::uuid as festa;
grant select on que to authenticated;

insert into public.events (id, tipo, abast, starts_at, puntos, published, reveal_at)
values
  ((select junta from que), 'reunio', 'junta', now() - interval '20 days', 0, true, null),
  ((select comi  from que), 'reunio', 'comi',  now() - interval '19 days', 0, true, null),
  ((select festa from que), 'fiesta', 'comi',  now() - interval '18 days', 10, true, null);

insert into public.event_title (event_id, titulo)
values
  ((select junta from que), 'Reunio tancada inventada'),
  ((select comi  from que), 'Trobada oberta inventada'),
  ((select festa from que), 'Festa inventada')
on conflict (event_id) do update set titulo = excluded.titulo;

-- La mateixa fila a totes tres: el que ha de canviar és qui la pot llegir, no
-- què hi diu.
insert into public.attendances (user_id, event_id, estado)
values
  ((select mirat from qui), (select junta from que), 'asistio'),
  ((select mirat from qui), (select comi  from que), 'asistio'),
  ((select mirat from qui), (select festa from que), 'asistio');

-- ── 1. la llista de nits, tal com la demana la pantalla ────────────────────

reset role;
select tests.authenticate_as('nits_mira');

select set_eq(
  $$ select a.event_id from public.attendances a
      where a.user_id = '00000000-0000-4000-8000-00000000d101'
        and a.estado = 'asistio' $$,
  array['00000000-0000-4000-8000-00000000df02',
        '00000000-0000-4000-8000-00000000df03']::uuid[],
  'les nits d''un altre son la trobada oberta i la festa, i la reunio de junta no hi es'
);

-- El control positiu del de sobre, dit a part perquè un `set_eq` que fallés
-- per les dues bandes alhora no diria quina de les dues s'ha trencat.
select is(
  (select count(*)::int from public.attendances a
    where a.user_id = (select mirat from qui)
      and a.event_id = (select comi from que)),
  1,
  'la reunio de la comi si que s''hi llegeix: la politica publica alguna cosa'
);

select is(
  (select count(*)::int from public.attendances a
    where a.user_id = (select mirat from qui)
      and a.event_id = (select junta from que)),
  0,
  'i la de junta no, ni sabent-ne l''identificador'
);

-- I que la fila hi és de debò: sense això el zero de sobre passaria per sempre
-- el dia que l'insert deixés de fer res.
reset role;
select is(
  (select count(*)::int from public.attendances a
    where a.user_id = (select mirat from qui)
      and a.event_id = (select junta from que)),
  1,
  'la fila de la reunio de junta existeix: el que falta es el dret a veure-la'
);

-- ── 2. i el títol d'una reunió de junta tampoc surt per les insígnies ──────

reset role;
insert into public.badges (user_id, codi, event_id)
values ((select mirat from qui), 'cap_de_setmana', (select junta from que)),
       ((select mirat from qui), 'primera',        (select festa from que));

select tests.authenticate_as('nits_mira');

select is(
  (select b.titol from public.member_badges((select mirat from qui)) b
    where b.codi = 'cap_de_setmana'),
  null::text,
  'una insignia lligada a una reunio de junta no en porta el titol'
);

select is(
  (select b.titol from public.member_badges((select mirat from qui)) b
    where b.codi = 'primera'),
  'Festa inventada',
  'i la d''una activitat de la comi si: es el contrast que fa dir alguna cosa al null de sobre'
);

select * from finish();
rollback;

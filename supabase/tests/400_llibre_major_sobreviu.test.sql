-- El llibre major sobreviu a qui el va escriure.
--
-- LA MIGRACIÓ 61 posa RESTRICT a `points_log.user_id` i `event_photos.user_id`.
-- Aquest fitxer prova les dues meitats, i la segona és la que importa: una
-- persona SENSE punts i SENSE fotos s'ha de poder esborrar igual. Si el
-- RESTRICT s'hagués posat en un lloc de més, el símptoma seria que ningú no
-- pot marxar mai, i no hi ha cap pantalla on això es vegi.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(8);

reset role;

-- ── Una persona amb punts no s'esborra ──────────────────────────────────────

select isnt_empty(
  $$ select 1 from public.points_log
      where user_id = '00000000-0000-4000-8000-000000000001' $$,
  'escenari muntat: l''alfa te punts al llibre major'
);

select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-4000-8000-000000000001' $$,
  '23503', null,
  'esborrar el perfil d''algu amb punts falla'
);

-- I per la cascada des d'auth.users, que es el cami de debo: esborrar el
-- compte de Google. Ha de fallar igual, i aquesta es la que importa.
select throws_ok(
  $$ delete from auth.users where id = '00000000-0000-4000-8000-000000000001' $$,
  '23503', null,
  'i esborrar-ne el compte tambe, que es per on passava'
);

select isnt_empty(
  $$ select 1 from public.points_log
      where user_id = '00000000-0000-4000-8000-000000000001' $$,
  'els punts hi segueixen'
);

-- ── Una persona amb fotos tampoc ────────────────────────────────────────────

insert into public.event_photos (event_id, user_id, path, thumb_path)
values ('00000000-0000-4000-8000-0000000000e1',
        '00000000-0000-4000-8000-000000000002',
        'auditoria/f.jpg', 'auditoria/f-t.jpg');

select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-4000-8000-000000000002' $$,
  '23503', null,
  'esborrar el perfil d''algu amb fotos tambe falla'
);

-- ── El control positiu: qui no ha deixat rastre, se'n va ────────────────────
--
-- Sense aixo, les quatre assercions de dalt passarien igual si `profiles` fos
-- inesborrable per a tothom, i el resultat seria que ningu no pot marxar mai.

create temporary table nou as
select '00000000-0000-4000-8000-0000000000f9'::uuid as id;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ((select id from nou), '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'ningu@example.test', '', now(), now(), now());

select is(
  (select count(*)::int from public.profiles where id = (select id from nou)),
  1,
  'el disparador li ha fet perfil'
);

select is_empty(
  $$ select 1 from public.points_log
      where user_id = '00000000-0000-4000-8000-0000000000f9' $$,
  'i no te ni un punt ni una foto'
);

select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-4000-8000-0000000000f9' $$,
  'aixi que se''n pot anar del tot'
);

select * from finish();
rollback;

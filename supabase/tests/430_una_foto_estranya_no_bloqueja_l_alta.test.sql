-- Donar-se d'alta amb una foto de perfil rara.
--
-- EL FORAT QUE AQUEST FITXER TAPA no és el de la migració 66: és el de la
-- prova. La 380 comprova el CHECK d'`avatar_url` fent UPDATE com un soci que
-- ja existeix, i per aquell camí tot anava bé. El camí que no es provava era
-- l'ALTA, on qui escriu la columna és el disparador i el valor ve del
-- proveïdor d'identitat sense passar per cap pantalla.
--
-- Per allà, un CHECK que rebutja no dona un error de camp: rebenta l'INSERT a
-- `auth.users` sencer i GoTrue contesta «Database error saving new user». La
-- persona no entra i res no diu per què.
--
-- Per això les assercions són sobre `lives_ok` de l'alta i no sobre el valor
-- de la columna: el que es defensa és que es pugui entrar. Que la foto rara no
-- es desi és la conseqüència, no el punt.
--
-- Els amfitrions i les persones són inventats, com a tot el repo.

begin;
select plan(10);

reset role;

create temporary table qui as
select '00000000-0000-4000-8000-0000000000e1'::uuid as bona,
       '00000000-0000-4000-8000-0000000000e2'::uuid as rara,
       '00000000-0000-4000-8000-0000000000e3'::uuid as sense,
       '00000000-0000-4000-8000-0000000000e4'::uuid as colada;

-- Un alta, tal com la fa GoTrue: una fila a `auth.users` i el disparador al
-- darrere.
create or replace function pg_temp.alta(p_id uuid, p_correu text, p_foto jsonb)
returns void language sql as $fn$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_user_meta_data)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', p_correu, '', now(), now(), now(), p_foto);
$fn$;

-- ── 1. La foto de sempre entra i es desa ────────────────────────────────────

select lives_ok(
  $$ select pg_temp.alta((select bona from qui), 'bona@example.test',
       '{"full_name":"Bona","picture":"https://lh3.googleusercontent.com/a/AAcd"}'::jsonb) $$,
  'una alta amb la foto de Google de sempre entra'
);

select is(
  (select avatar_url from public.profiles where id = (select bona from qui)),
  'https://lh3.googleusercontent.com/a/AAcd',
  'i la foto es desa tal qual'
);

-- ── 2. Una foto d'un altre amfitrio NO bloqueja l'alta ──────────────────────
--
-- Aquesta es la que fallava. Abans de la 66, aixo tornava 23514 i es desfeia
-- l'INSERT a auth.users sencer.

select lives_ok(
  $$ select pg_temp.alta((select rara from qui), 'rara@example.test',
       '{"full_name":"Rara","picture":"https://exemple.invalid/foto.jpg"}'::jsonb) $$,
  'i una amb la foto en un altre amfitrio TAMBE entra. Aixo es la 66'
);

select is(
  (select count(*)::int from public.profiles where id = (select rara from qui)),
  1,
  'te perfil'
);

select is(
  (select avatar_url from public.profiles where id = (select rara from qui)),
  null,
  'sense foto, que es la conseqüencia i no el punt'
);

select is(
  (select nombre from public.profiles where id = (select rara from qui)),
  'Rara',
  'i amb el nom, que es el que de debo importava'
);

-- ── 3. Sense cap foto, com sempre ───────────────────────────────────────────

select lives_ok(
  $$ select pg_temp.alta((select sense from qui), 'sense@example.test',
       '{"full_name":"Sense"}'::jsonb) $$,
  'i qui no en te tampoc no peta'
);

-- ── 4. I la meitat de la 59 que faltava: no s'hi pot colar una balisa ───────
--
-- `raw_user_meta_data` la posa el client a la via d'entrada per correu. La 59
-- tancava l'UPDATE i deixava obert aquest INSERT.

select lives_ok(
  $$ select pg_temp.alta((select colada from qui), 'colada@example.test',
       '{"full_name":"Colada","avatar_url":"https://rastrejador.invalid/px.gif?u=1"}'::jsonb) $$,
  'una balisa a les metadades de l''alta no fa petar res'
);

select is(
  (select avatar_url from public.profiles where id = (select colada from qui)),
  null,
  'pero tampoc no s''hi cola'
);

-- ── El control positiu ──────────────────────────────────────────────────────
--
-- Sense aixo, tot l'anterior passaria igual si el disparador hagues deixat
-- d'escriure `avatar_url` del tot, i llavors ningu no tindria mai foto.

select isnt_empty(
  $$ select 1 from public.profiles
      where avatar_url like 'https://lh3.googleusercontent.com/%' $$,
  'i alguna foto si que s''arriba a desar, que si no aixo passaria buit'
);

select * from finish();
rollback;

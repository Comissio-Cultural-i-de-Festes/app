-- L'avatar, i que no pugui apuntar on vulgui.
--
-- LA MIGRACIÓ 59 posa el `CHECK`. Aquest fitxer prova les dues meitats, i la
-- positiva és la que importa més: `authenticated` té grant d'UPDATE sobre
-- aquesta columna a posta —canviar-se la foto és cosa de cadascú— i una tanca
-- massa estreta trencaria això sense que cap altra prova se n'adonés.
--
-- Les tres formes que han de passar són les tres que la vida real produeix: cap
-- avatar, el camí que escriu `uploadAvatar()` i la URL que arriba de Google.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(9);

reset role;
select tests.authenticate_as('alfa');

-- ── Les tres que han de passar ──────────────────────────────────────────────

select lives_ok(
  $$ update public.profiles set avatar_url = null where id = (select auth.uid()) $$,
  'sense avatar: val'
);

select lives_ok(
  $$ update public.profiles
        set avatar_url = '00000000-0000-4000-8000-000000000001/1788000000000.jpg'
      where id = (select auth.uid()) $$,
  'un cami del bucket amb .jpg: val'
);

select lives_ok(
  $$ update public.profiles
        set avatar_url = '00000000-0000-4000-8000-000000000001/1788000000000.webp'
      where id = (select auth.uid()) $$,
  'i amb .webp: val'
);

-- `lh3` i `lh6`: Google reparteix les fotos entre tots dos, i fixar-ne un seria
-- tornar-hi el dia que canviï.
select lives_ok(
  $$ update public.profiles
        set avatar_url = 'https://lh3.googleusercontent.com/a/ACg8ocFake'
      where id = (select auth.uid()) $$,
  'una foto de Google a lh3: val'
);

select lives_ok(
  $$ update public.profiles
        set avatar_url = 'https://lh6.googleusercontent.com/a/ACg8ocFake'
      where id = (select auth.uid()) $$,
  'i a lh6 tambe, que Google les reparteix'
);

-- ── I la balisa, que és el motiu del fitxer ─────────────────────────────────

select throws_ok(
  $$ update public.profiles
        set avatar_url = 'https://el-servidor-del-soci.example/x.png'
      where id = (select auth.uid()) $$,
  '23514', null,
  'un amfitrio qualsevol: refusat'
);

-- El truc obvi: posar el nom de Google en algun lloc de l'URL que no sigui
-- l'amfitrio. L'ancoratge `^https://lh[0-9]+\.` ho tanca.
select throws_ok(
  $$ update public.profiles
        set avatar_url = 'https://atacant.example/lh3.googleusercontent.com/x.png'
      where id = (select auth.uid()) $$,
  '23514', null,
  'el nom de Google al cami i no a l''amfitrio: refusat'
);

select throws_ok(
  $$ update public.profiles
        set avatar_url = 'https://lh3.googleusercontent.com.atacant.example/x.png'
      where id = (select auth.uid()) $$,
  '23514', null,
  'un subdomini que acaba en un altre domini: refusat'
);

-- I sense esquema, que aniria pel cami del bucket i hi fallaria, pero millor
-- que no hi arribi.
select throws_ok(
  $$ update public.profiles
        set avatar_url = 'no-es-ni-un-cami-ni-una-url'
      where id = (select auth.uid()) $$,
  '23514', null,
  'text qualsevol: refusat'
);

select * from finish();
rollback;

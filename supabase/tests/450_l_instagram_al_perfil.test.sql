-- L'Instagram del perfil: què s'hi pot desar, qui l'hi pot desar i qui el veu.
--
-- PER QUÈ LES TRES COSES AL MATEIX FITXER. La columna és una decisió de
-- privadesa i les tres meitats en formen part: si la tanca cau, un soci hi pot
-- desar un enllaç; si el grant cau, no es pot omplir i la funció no existeix;
-- i si la lectura cau, s'omple i no la veu ningú, que és el mateix que no
-- tenir-la. Provar-ne una sola deixaria passar les altres dues.
--
-- LES ASSERCIONS NEGATIVES SÓN SOBRE '23514' i no sobre «no hi ha files». Un
-- UPDATE que la política filtra torna zero files i 200; el que un CHECK refusa
-- torna 23514. Comptar files passaria igual el dia que la tanca desaparegués.
--
-- I SOBRE EL NOM DE LA RESTRICCIÓ, NO NOMÉS SOBRE EL CODI. El 23514 és
-- *qualsevol* violació de check de `profiles`, i la taula en té uns quants
-- (`profiles_curs_check`, `profiles_estat_check`…). Amb el missatge a null, el
-- dia que algú deixés caure `profiles_instagram_check` i l'UPDATE petés per una
-- altra raó, aquestes set assercions continuarien verdes mentre la tanca que
-- diuen que proven ja no hi seria. Per això s'hi compara també el missatge, que
-- és l'únic lloc on Postgres escriu el nom de la restricció que ha saltat.
--
-- El preu és que reanomenar el check trenca el fitxer. Es paga: reanomenar-lo
-- sense que res se'n queixi és exactament el que no ha de passar en silenci.
-- L'alternativa —mirar `pg_constraint` per muntar el missatge— tornaria a fer
-- passar la prova amb el check esborrat, que és el forat que s'està tapant.

\set ig_check 'new row for relation "profiles" violates check constraint "profiles_instagram_check"'

-- Persones inventades, com a tot el repo.

begin;
select plan(16);

reset role;
select tests.authenticate_as('alfa');

-- ── 1. El que ha de passar ──────────────────────────────────────────────────

select lives_ok(
  $$ update public.profiles set instagram = 'la.comi_2026'
      where id = (select auth.uid()) $$,
  'un nom d''usuari amb punt i guio baix: val'
);

select is(
  (select instagram from public.profiles where id = (select auth.uid())),
  'la.comi_2026',
  'i es desa tal qual, sense arrear-hi cap arrova'
);

-- Trenta és el màxim que accepta Instagram, i el límit ha de ser inclusiu: amb
-- `{1,29}` el nom més llarg que existeix de debò seria refusat.
select lives_ok(
  $$ update public.profiles set instagram = repeat('a', 30)
      where id = (select auth.uid()) $$,
  'trenta caracters: val, que es el maxim que accepta Instagram'
);

select lives_ok(
  $$ update public.profiles set instagram = null where id = (select auth.uid()) $$,
  'i treure''l escrivint null: val'
);

-- ── 2. El que no ──────────────────────────────────────────────────────────
--
-- La primera és la que motiva el fitxer: si aquí hi cap una URL, l'app dibuixa
-- un enllaç tocable cap allà a la pantalla de tots els altres socis.

select throws_ok(
  $$ update public.profiles set instagram = 'https://instagram.com/algu'
      where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'una URL sencera: refusada'
);

select throws_ok(
  $$ update public.profiles set instagram = 'javascript:alert(1)'
      where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'un javascript:, que es el motiu pel qual la tanca es aqui i no al formulari'
);

-- L'arrova és com la gent l'escriu i com surt dibuixada a la pantalla, però no
-- és part del nom: el client la treu abans d'enviar i la base de dades no se'n
-- refia.
select throws_ok(
  $$ update public.profiles set instagram = '@algu' where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'amb l''arrova del davant: refusat'
);

select throws_ok(
  $$ update public.profiles set instagram = 'dos noms' where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'amb un espai al mig: refusat'
);

select throws_ok(
  $$ update public.profiles set instagram = repeat('a', 31)
      where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'trenta-un caracters: refusat'
);

-- La cadena buida no és «no en tinc»: és una fila que diu que sí que en té i
-- que el nom és res. Treure'l ha d'escriure null, i el client ho fa.
select throws_ok(
  $$ update public.profiles set instagram = '' where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'la cadena buida: refusada, perque treure''l vol dir null'
);

-- Un salt de línia al final passaria per sota d'un `$` que fos sensible a les
-- línies. El de Postgres no ho és, i aixo ho deixa escrit.
select throws_ok(
  $$ update public.profiles set instagram = e'algu\nhttps://el-que-sigui'
      where id = (select auth.uid()) $$,
  '23514', :'ig_check',
  'un salt de linia i una segona ratlla: refusat'
);

-- ── 3. El grant, que és el que fa que sigui de cadascú ──────────────────────
--
-- La columna és nova dins d'un `grant update (…)` que ja existia. La prova és
-- que s'hi ha afegit i no que l'hagi substituït: el nom encara s'ha de poder
-- canviar, i `role` i `estat` encara han de ser inabastables.

select lives_ok(
  $$ update public.profiles set nombre = 'Alfa', instagram = 'alfa_2026'
      where id = (select auth.uid()) $$,
  'el nom i l''instagram a la mateixa sentencia: val'
);

select throws_ok(
  $$ update public.profiles set instagram = 'alfa_2026', role = 'owner'
      where id = (select auth.uid()) $$,
  '42501', null,
  'i colar-hi un role al costat: refusat, i per grant i no per politica'
);

select throws_ok(
  $$ update public.profiles set instagram = 'alfa_2026', estat = 'baixa'
      where id = (select auth.uid()) $$,
  '42501', null,
  'i un estat tampoc'
);

-- La fila d'un altre. La política la filtra en comptes de refusar-la, o sigui
-- que això no peta: torna zero files i un 200. Per això l'assercio va sobre la
-- fila —que alfa sí que pot llegir— i no sobre cap codi d'error.
update public.profiles set instagram = 'segrestat'
 where id = '00000000-0000-4000-8000-000000000002';

select is(
  (select instagram from public.profiles
    where id = '00000000-0000-4000-8000-000000000002'),
  null,
  'i l''instagram d''un altre soci es queda com estava'
);

-- ── 4. I que un altre soci actiu el llegeixi, que és tot el punt ────────────

reset role;
select tests.authenticate_as('bravo');

select is(
  (select instagram from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'),
  'alfa_2026',
  'un altre soci actiu el llegeix, que es per aixo que la columna es aqui'
);

select * from finish();
rollback;

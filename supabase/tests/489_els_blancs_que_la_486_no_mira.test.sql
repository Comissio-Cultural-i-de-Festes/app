-- Els blancs que la 486 no mira, i el lloc on encara resten punts.
--
-- PER QUÈ CAL UN SEGON FITXER. La 486 mira tres entrades —`E'\t'`, `E'\n'` i
-- `E' \t\r\n '`— i tanca amb un `is_empty` sobre `nota !~ '\S'`. Les quatre
-- assercions passen igual amb la correcció que la migració 77 DESCARTA pel seu
-- nom: `btrim(coalesce(p_nota, ''), E' \t\r\n')`, els sis caràcters. I el seu
-- `is_empty` tampoc la veu caure, perquè `\S` és `[^[:space:]]` i en aquesta
-- base ni U+200B ni U+FEFF són `[[:space:]]`: una nota que és una marca
-- d'ordre de bytes SATISFÀ `\S` i la consulta no la troba. Mesurat:
--
--   select chr(65279) ~ '\S'  -->  t
--   select chr(8203)  ~ '\S'  -->  t
--   la resta dels blancs      -->  f
--
-- O sigui que el fitxer que fixa l'arreglament no distingeix l'arreglament
-- desplegat del que la seva pròpia migració diu que no basta. Comprovat
-- reemplaçant `private.nota_neta` per la versió dels sis caràcters dins d'una
-- transacció: les cinc assercions de la 486 verdes i, al mateix temps, un
-- admin que no és owner restant 500 punts amb un U+FEFF per nota.
--
-- EL QUE AFEGEIX AQUEST FITXER són precisament els dos caràcters que la llista
-- explícita de la 77 hi posa de més respecte de `[[:space:]]`, més els que hi
-- entrarien per `[[:space:]]` en aquesta configuració regional però no en una
-- altra —que és l'argument sencer de la migració per no escriure `\S`—. Cap
-- d'ells no és teòric: U+00A0 i U+FEFF són el que queda enganxat quan algú
-- copia text d'un processador de textos o d'un full de càlcul.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(14);

reset role;
select tests.authenticate_as('junta_alfa');

-- ── 1. award_points: cap blanc no és una nota ───────────────────────────────
-- El negatiu, que és on la nota deixa de ser cosmètica: sense ella un admin
-- que no és owner no hi podria arribar.

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, U&'\00a0') $$,
  '22023', 'un ajust a ma vol una nota', 'un espai dur no es una nota');

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, U&'\feff') $$,
  '22023', 'un ajust a ma vol una nota',
  'ni una marca d''ordre de bytes: es el cas que la 486 no pot veure');

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, U&'\200b') $$,
  '22023', 'un ajust a ma vol una nota', 'ni un espai d''amplada zero');

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, U&'\3000') $$,
  '22023', 'un ajust a ma vol una nota', 'ni l''espai ideografic');

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, U&'\2007') $$,
  '22023', 'un ajust a ma vol una nota', 'ni l''espai de l''amplada d''una xifra');

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, E'\t' || U&'\00a0' || U&'\feff' || U&'\3000' || E' \n') $$,
  '22023', 'un ajust a ma vol una nota', 'ni tots junts');

-- ── 2. I una nota de debò no es perd, encara que hi vagi enganxada ─────────
-- L'altra meitat: una verja que es mengés el text seria pitjor que el forat.

select lives_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000001',
       null, 'manual', -3, U&'\feff' || 'quota de setembre' || U&'\3000') $$,
  'una nota de debo envoltada de blancs si que entra');

select is(
  (select l.nota from public.points_log l
    where l.user_id = '00000000-0000-4000-8000-000000000001'
      and l.motivo = 'manual'
    order by l.created_at desc limit 1),
  'quota de setembre',
  'i es desa sencera, nomes sense els extrems');

-- `private.nota_neta` es crida com a postgres i no com a junta: no te grant
-- per a `authenticated` i no n'ha de tenir —la criden funcions definer—, o
-- sigui que provar-la des de la persona autenticada peta amb 42501 abans de
-- provar res.
reset role;

select is(
  private.nota_neta('a' || U&'\00a0' || 'b'),
  'a' || U&'\00a0' || 'b',
  'un blanc de dins no es toca: nomes es retallen els extrems');

select is(
  private.nota_neta('primera' || E'\n' || 'segona'),
  'primera' || E'\n' || 'segona',
  'ni el salt de linia de dins, que un motiu pot ocupar dues linies');

select tests.authenticate_as('junta_alfa');

-- ── 3. El mateix blanc, a l'altra RPC que resta punts ──────────────────────
--
-- `avisa` demana la seva nota amb `length(btrim(coalesce(p_nota,''))) = 0`
-- —un sol argument— i la migració 78 la va tornar a escriure DESPRÉS de la 77
-- sense cridar `private.nota_neta`. Un avís resta punts i té nota obligatòria
-- exactament pel mateix motiu que un ajust a mà, i el `check` de la taula
-- (`length(btrim(nota)) between 1 and 500`, migració 73) té el mateix forat,
-- o sigui que la fila hi cap.
--
-- VAN COM A `todo` I NO COM A FALLADES: el forat és obert avui i aquest fitxer
-- no l'arregla —arreglar-lo vol una migració, i les migracions no es toquen
-- des d'aquí—. Amb `todo` la verja no es queda vermella per a tothom i el dia
-- que algú ho tapi, pgTAP dirà que aquestes assercions passen quan no ho
-- havien de fer, que és el recordatori de treure el `todo_start`.
--
-- Reproduït per Kong i PostgREST amb el token d'un admin que no és l'owner:
-- `avisa(p_nota => E'\t', p_punts => -5)` torna 200 i la fila surt a la
-- pantalla del soci com «Avís · −5» amb el motiu en blanc.

select todo_start('la 78 va reescriure `avisa` sense cridar `private.nota_neta`');

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000001',
       'mal_gest', E'\t', -5) $$,
  '22023', 'un avis sense motiu escrit no es un avis',
  'un tabulador tampoc es el motiu d''un avis');

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000001',
       'mal_gest', U&'\00a0', -5) $$,
  '22023', 'un avis sense motiu escrit no es un avis',
  'ni un espai dur');

select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000001',
       'mal_gest', U&'\feff', -5) $$,
  '22023', 'un avis sense motiu escrit no es un avis',
  'ni una marca d''ordre de bytes');

select todo_end();

-- La tanca de l'altra banda, aquesta sí que de debò: l'espai normal el refusa
-- des del primer dia, o sigui que el que falla és la llista i no la regla.
select throws_ok(
  $$ select public.avisa('00000000-0000-4000-8000-000000000001',
       'mal_gest', '   ', -5) $$,
  '22023', 'un avis sense motiu escrit no es un avis',
  'l''espai normal si que el refusa: el que falta es la resta de la llista');

select * from finish();
rollback;

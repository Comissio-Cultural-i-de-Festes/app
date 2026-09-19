-- L'Instagram d'un altre soci, escrit per algú de la junta: no s'hi escriu.
--
-- QUÈ FIXA AQUEST FITXER. La migració 79. El 450 ja comprova que un soci no pot
-- tocar l'Instagram d'un altre —la política `profiles_update_self` li filtra la
-- fila— però `profiles` també té `profiles_update_admin`, que deixa escriure
-- QUALSEVOL fila a qui passa `private.is_admin()`, i el `grant update
-- (instagram)` de la 70 és per a `authenticated` sencer, on la junta hi és a
-- dins. Entre les dues coses, un membre de la junta podia penjar el compte
-- d'Instagram que volgués sota la cara i el nom d'un altre soci, i la fila per
-- seguir de `/soci/:id` el dibuixa com un enllaç tocable per a tots els socis.
-- El `CHECK` de la 70 hi posa la FORMA —només un nom d'usuari— però no diu res
-- de qui l'escriu.
--
-- LA DECISIÓ QUE ES VA PRENDRE, perquè no calgui anar a buscar-la: no és el
-- comportament que es vol. L'issue diu «publicar-lo un mateix», i decidir-lo
-- per algú altre —o esborrar-li'l, que és el mateix acte amb el signe canviat—
-- no és una correcció de dades, és parlar en nom seu. La 79 hi posa la tanca a
-- `private.profiles_guard()` i no al grant ni a la política, perquè el grant de
-- columna és per rol i aquí el soci i la junta són el mateix rol, i perquè ni
-- `USING` ni `WITH CHECK` poden dir «aquesta columna no s'ha mogut».
--
-- PER QUÈ AQUESTES DUES ASSERCIONS I NO UN `throws_ok`. La 79 fixa el valor
-- vell en comptes de petar, i per això el que es mira aquí és la columna
-- després de l'`update`, no l'error: no n'hi ha cap. Un `throws_ok` seria
-- vermell amb l'arreglament posat. La migració explica per què es va triar
-- així; el que en depèn és la forma d'aquest fitxer.
--
-- L'ALTRA MEITAT ÉS EL 456, i no és opcional: sol, aquest fitxer passaria igual
-- amb una tanca massa ampla que li prengués a la junta l'UPDATE sobre la fila
-- d'un altre i se li mengés la correcció de noms. La capa d'RLS hi afegeix el
-- que cap dels dos pot veure —què rep qui escriu—, a
-- `tests/rls/instagram_junta.test.ts`.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(2);

-- El valor d'alfa d'abans, capturat i no donat per fet: aquesta columna
-- l'omplen els socis des de l'app i la suite de RLS hi escriu sense desfer-ho.
create temp table ig_alfa as
select instagram from public.profiles
 where id = '00000000-0000-4000-8000-000000000001';
grant select on ig_alfa to authenticated;

reset role;
select tests.authenticate_as('junta_alfa');

update public.profiles set instagram = 'compte_que_no_es_seu'
 where id = '00000000-0000-4000-8000-000000000001';

select is(
  (select instagram from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'),
  (select instagram from ig_alfa),
  'la junta no escriu l''instagram d''un altre soci'
);

-- I tampoc l'esborra: treure-li a algú la manera que té de ser trobat és el
-- mateix acte amb el signe canviat.
update public.profiles set instagram = null
 where id = '00000000-0000-4000-8000-000000000001';

select is(
  (select instagram from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'),
  (select instagram from ig_alfa),
  'ni l''hi esborra'
);

select * from finish();
rollback;

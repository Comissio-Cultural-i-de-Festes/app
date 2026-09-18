-- L'Instagram d'un altre soci, escrit per algú de la junta.
--
-- AQUEST FITXER FALLA AVUI, I ES DEIXA ESCRIT PERQUÈ FALLI. És la prova que
-- falta, no una prova d'una cosa que ja va bé: el 450 comprova que un soci no
-- pot tocar l'Instagram d'un altre —la política `profiles_update_self` el
-- filtra i el 450 ho assereix— però `profiles` també té
-- `profiles_update_admin`, que deixa escriure QUALSEVOL fila a qui passa
-- `private.is_admin()`. El `grant update (instagram)` de la migració 70 és per
-- a `authenticated` sencer, i la junta hi és a dins.
--
-- Efecte: un membre de la junta pot penjar el compte d'Instagram que vulgui a
-- la cara i el nom d'un altre soci, i la fila per seguir de `/soci/:id` el
-- dibuixa com un enllaç tocable a tots els socis. El `CHECK` de la 70 hi posa
-- la forma —només un nom d'usuari— però no diu res de qui l'escriu. Cap
-- pantalla ho ofereix, i per això no s'havia vist: la barrera aquí no és el
-- formulari, és la política, i és exactament el raonament amb què la mateixa
-- migració 70 justifica el `CHECK`.
--
-- QUÈ HA DE DECIDIR QUI ARREGLI AIXÒ. O bé és el comportament que es vol —i
-- llavors s'escriu a la migració i aquesta prova passa a dir «la junta sí que
-- pot»—, o bé no ho és, i llavors cal una barrera: un `WITH CHECK` a
-- `profiles_update_admin` que deixi fora la columna, o treure `instagram` del
-- que la junta pot escriure. El que no pot quedar és sense dir.
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

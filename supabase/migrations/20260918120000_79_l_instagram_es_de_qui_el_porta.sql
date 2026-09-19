-- L'Instagram el posa i el treu la persona de qui és la fila, i ningú més.
--
-- EL FORAT. La 70 va afegir `instagram` al `grant update (…)` de `profiles`,
-- que és per a `authenticated` sencer. La junta també és `authenticated`, i
-- `profiles_update_admin` li deixa escriure QUALSEVOL fila —hi és perquè puguin
-- corregir un nom mal escrit—, així que entre les dues coses un membre de la
-- junta podia penjar el compte d'Instagram que volgués sota la cara i el nom
-- d'un altre soci, i `/soci/:id` el dibuixa com un enllaç tocable per a tots
-- els socis. El `CHECK` de la 70 només diu quina FORMA pot tenir el valor, mai
-- qui l'escriu. Cap pantalla ho oferia, i per això no s'havia vist: la 70
-- mateixa raona que el formulari no és cap barrera, i aquí el raonament li
-- tocava a ella.
--
-- L'issue diu «publicar-lo un mateix». Això no és una columna administrativa
-- com `role` o `estat`: és una manera de deixar-se trobar, i decidir-la per
-- algú altre —o esborrar-la-hi, que és el mateix acte amb el signe canviat— no
-- és una correcció, és parlar en nom seu. Si un soci demana ajuda per posar-lo,
-- la resposta és la pantalla que ja té: `/perfil/editar`, amb el camp al mig.
-- La junta no perd res que tingués per fer la seva feina.
--
-- PER QUÈ AL DISPARADOR I NO AL GRANT NI A LA POLÍTICA, que és la pregunta de
-- debò en aquesta casa:
--
--   * El grant de columna no hi arriba. Els privilegis de columna es comproven
--     abans que l'RLS —per això la 34 va haver de desfer un `revoke select`
--     contra un grant de taula sencera a `attendances`— però es donen a un ROL,
--     i aquí el soci i la junta són el mateix rol. Un `revoke update
--     (instagram)` els el trauria als dos i deixaria la columna morta.
--   * La política tampoc. `WITH CHECK` només veu la fila NOVA i `USING` només
--     la VELLA: cap de les dues pot dir «aquesta columna no s'ha mogut».
--     Estrènyer `profiles_update_admin` per files es menjaria la correcció del
--     nom, que és per a què existeix.
--
-- Queda el disparador, que ja hi és i que el 07 descriu exactament així: un
-- reforç darrere dels grants, per a allò que els grants no poden dir. La 70
-- deia que no s'havia de tocar perquè només enumerava camps que van per RPC;
-- el que no havia vist és que `instagram` necessita una regla d'una altra mena
-- —no «ningú des del client» sinó «només qui és la fila»—, i aquest és l'únic
-- lloc que la sap escriure.
--
-- PER QUÈ FIXA EL VALOR EN COMPTES DE PETAR, que és la decisió que ha costat.
-- La versió amb `raise … 42501` era la primera escrita i s'ha descartat per
-- dues raons:
--
--   1. La mateixa frontera contestaria diferent segons qui la creués. Un soci
--      que avui prova d'escriure l'Instagram d'un altre no rep cap error: la
--      política li filtra la fila i se'n torna un 200 amb zero files (ho
--      assereix el 450). Fer que la junta rebés un 42501 pel mateix acte vol
--      dir dues formes de provar la mateixa regla i dues respostes per a la
--      mateixa resposta: no.
--   2. Petar s'emporta la sentència sencera. Un `update` de la junta que
--      arreglés el nom i, de passada, portés l'Instagram de la fila que acaba
--      de llegir es quedaria sense el nom també. Fixar el valor és més precís:
--      cau exactament el camp que no els pertoca i la resta de la sentència
--      arriba.
--
-- El preu, escrit perquè es vegi, i és més petit del que sembla. Com que el
-- `RETURNING` de PostgREST corre DESPRÉS d'un disparador `before`, qui demana
-- la representació —`.update(…).select(…)`, que és `Prefer: return=representation`—
-- rep un 200 amb el valor vell ja corregit a dins: se n'assabenta a la mateixa
-- resposta, sense rellegir res. Qui no la demana —un `.update(…)` pelat, que és
-- `return=minimal`— rep un 204 sense cos i no se n'assabenta fins que torni a
-- llegir la fila. O sigui que el punt cec és el 204, no el 200. S'accepta perquè
-- avui no hi ha cap pantalla que ofereixi editar l'Instagram d'un altre, i el
-- dia que la junta en tingui una per editar el perfil d'algú es construirà
-- sabent aquesta regla, no ensopegant-hi. Ho assereix
-- `tests/rls/instagram_junta.test.ts`, que és l'única capa que veu la resposta.
--
-- Res de tot això toca les RPC: el primer `if` de la funció deixa passar tot el
-- que no ve directament del client, i `redeem_invite()` i companyia hi entren
-- com a `postgres`.

create or replace function private.profiles_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.estat is distinct from old.estat
     or new.created_at is distinct from old.created_at
  then
    raise exception 'camps protegits: role i estat nomes per rpc'
      using errcode = '42501';
  end if;

  -- `is distinct from` i no `<>`: amb un `auth.uid()` nul —que no hauria de
  -- passar amb `current_user` a 'authenticated', però no depenem d'això— la
  -- comparació amb `<>` tornaria null, l'`if` no entraria i el canvi passaria.
  -- Així el cas dubtós es tanca en comptes d'obrir-se.
  if new.instagram is distinct from old.instagram
     and old.id is distinct from (select auth.uid())
  then
    new.instagram := old.instagram;
  end if;

  return new;
end $$;

comment on column public.profiles.instagram is
  'Nom d''usuari d''Instagram, sense @ i sense URL. Públic per a tot soci actiu: '
  'la columna és llegible pel grant de taula sencera de 03_grants.sql. Buit vol '
  'dir que no surt enlloc. QUI LA POT ESCRIURE: la frontera només mira les '
  'escriptures que arriben com a `authenticated`, és a dir les directes del '
  'client per PostgREST, i d''aquelles només en deixa passar les del soci de qui '
  'és la fila —el grant de columna és per a `authenticated` i la junta hi és a '
  'dins, i qui els separa és `private.profiles_guard()`, que fixa el valor vell '
  'quan el qui escriu no és el titular. NO és una frontera per a `service_role` '
  'ni per a les RPC `security definer`: la guarda es retira pel `current_user` i '
  'les deixa escriure qualsevol fila.';

-- L'Instagram al perfil, i que sigui públic a posta.
--
-- PER QUÈ A `profiles` I NO A `profile_contact`. `authenticated` té el
-- `grant select` de TOTA la taula `profiles` (03_grants.sql), o sigui que una
-- columna nova hi és llegible per tots els socis actius el mateix dia que
-- s'afegeix. Per al telèfon això seria un error i per això viu a
-- `profile_contact`, que només llegeixen el propi soci i la junta. Aquí és
-- exactament el que es vol: la fila per seguir algú no serveix de res si no la
-- veu ningú. Posar-lo a la taula privada voldria dir obrir-hi una política nova
-- per publicar-ne una columna —molta més feina per arribar al mateix lloc, i
-- amb la taula privada mig oberta.
--
-- NO HI HA CAP INTERRUPTOR PER AMAGAR-LO. La columna admet null i buit vol dir
-- que no surt: qui no el vulgui publicar el deixa en blanc. Un
-- `hide_from_instagram` al costat de `hide_from_ranking` seria un segon estat
-- que pot contradir el primer.
--
-- ES DESA EL NOM D'USUARI, MAI UNA URL, I LA TANCA VA AQUÍ. `profiles`
-- s'escriu amb un `update` directe des del client —és la decisió que explica
-- `setMyName`—, així que el formulari no és cap barrera: qui vulgui pot enviar
-- el que li sembli per PostgREST. Si la columna admetés text lliure, qualsevol
-- soci hi podria desar `https://el-que-sigui` o un `javascript:` i l'app
-- dibuixaria un enllaç tocable cap allà A TOTS ELS ALTRES SOCIS. Desant només
-- el nom d'usuari, l'URL la construeix el client en un sol lloc i no queda res
-- a injectar.
--
-- El patró és el que accepta Instagram: lletres, xifres, punt i guió baix, fins
-- a 30. També rebutja la cadena buida, o sigui que «treure'l» ha d'escriure
-- null i no `''`. El client normalitza abans d'enviar —`trim`, fora l'`@` del
-- davant, i buit passa a null— però la tanca no depèn d'això.
--
-- `private.profiles_guard()` no s'ha de tocar: enumera els camps prohibits
-- (`id`, `role`, `estat`, `created_at`) i aquest no hi és.

alter table public.profiles
  add column instagram text
    constraint profiles_instagram_check
      check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');

comment on column public.profiles.instagram is
  'Nom d''usuari d''Instagram, sense @ i sense URL. Públic per a tot soci actiu: '
  'la columna és llegible pel grant de taula sencera de 03_grants.sql. Buit vol '
  'dir que no surt enlloc.';

-- S'afegeix al grant de columnes que ja hi ha; els grants de columna són
-- acumulatius, així que això no toca els sis camps d'abans.
grant update (instagram) on public.profiles to authenticated;

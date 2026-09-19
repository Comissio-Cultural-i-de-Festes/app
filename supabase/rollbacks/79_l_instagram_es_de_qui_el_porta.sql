-- Rollback de la migració 79. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `private.profiles_guard()` a la versió del 07: només els quatre camps
-- que van per RPC (`id`, `role`, `estat`, `created_at`). Desfer-ho vol dir
-- tornar a deixar que qualsevol membre de la junta posi i tregui l'Instagram
-- d'un altre soci per PostgREST, que és el forat que la 79 tapa. Es deixa
-- escrit aquí i no en un comentari amable: qui apliqui aquest fitxer ha de
-- saber què torna a obrir.
--
-- El comentari de la columna també torna al text de la 70. No canvia cap
-- comportament, però un comentari que descriu una garantia que ja no hi és és
-- pitjor que cap comentari.
--
-- Les files ja escrites no es toquen: la 79 no en va moure cap, només va
-- decidir qui les pot moure d'ara endavant.
--
-- ORDRE: NO DEPÈN DE RES I NO EN DESFÀ RES. `private.profiles_guard()` l'han
-- escrita dues migracions —la 07 i la 79— i cap altra, o sigui que el cos
-- d'aquí no pot passar per sobre de cap correcció posterior; el comentari de la
-- columna tampoc l'ha tocat ningú després de la 79. És el defecte que el
-- rollback de la 76 va portar una temporada, i aquí no hi és.
-- `tests/rollbacks-cos-al-dia.test.ts` ho comprova per a tot el directori.
--
-- SI EL QUE VOLS ÉS TREURE LA COLUMNA SENCERA, aquest fitxer no et cal:
-- `rollbacks/70_l_instagram_al_perfil.sql` ja torna la guarda a la versió del
-- 07 abans de fer el `drop column`, perquè amb la guarda de la 79 posada la
-- columna no es pot esborrar sense deixar `profiles` inescrivible des del
-- client. I si els apliques tots dos, aquest va PRIMER: el `comment on column`
-- d'aquí sota peta amb un 42703 si la columna ja no hi és.

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

  return new;
end $$;

comment on column public.profiles.instagram is
  'Nom d''usuari d''Instagram, sense @ i sense URL. Públic per a tot soci actiu: '
  'la columna és llegible pel grant de taula sencera de 03_grants.sql. Buit vol '
  'dir que no surt enlloc.';

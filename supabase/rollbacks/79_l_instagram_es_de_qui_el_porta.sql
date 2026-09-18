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

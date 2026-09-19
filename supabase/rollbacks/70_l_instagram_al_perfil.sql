-- Rollback de la migració 70. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu la columna `instagram` de `profiles`, i amb ella el `check` i el
-- `grant update (instagram)`: els dos pengen de la columna i cauen sols amb el
-- `drop column`. No cal —ni s'ha de— revocar el grant a part; fer-ho abans del
-- drop només afegiria una sentència que pot fallar sola i deixar la columna
-- escrivible a mitges.
--
-- AIXÒ ESBORRA DADES DE SOCIS. És l'única cosa d'aquest directori que no és
-- reversible tornant a aplicar la migració: el nom d'usuari que cadascú hi hagi
-- desat no és enlloc més, i qui el vulgui altra vegada l'ha de tornar a
-- escriure. Per això va amb `if exists` i prou, sense cap còpia a una taula de
-- banda: una taula d'òrfenes amb comptes d'Instagram de socis és exactament la
-- dada que la 70 volia tenir en un sol lloc i sota el `check`.
--
-- AQUEST FITXER TAMBÉ DESFÀ EL DISPARADOR DE LA 79, I NO ÉS OPCIONAL.
-- Quan es va escriure això, la 79 no existia i aquí hi deia que
-- `private.profiles_guard()` no s'havia de tocar perquè la 70 no l'havia
-- tocat. Va deixar de ser cert: la 79 hi va afegir una branca que llegeix
-- `new.instagram` i `old.instagram` per decidir si qui escriu és el titular de
-- la fila.
--
-- El cos d'una funció plpgsql no és a `pg_depend` —els camps d'un `record` es
-- resolen quan la funció corre, no quan es crea—, així que el `drop column` de
-- més avall NO peta: passa, diu `ALTER TABLE`, i sembla que tot ha anat bé. El
-- que peta és el primer `update` que arribi del client després, sigui de qui
-- sigui:
--
--     ERROR:  record "new" has no field "instagram"
--     CONTEXT:  PL/pgSQL function private.profiles_guard() line 20 at IF
--
-- O sigui: tot el que arriba a `profiles` com un `update` directe del client
-- cau alhora —`/perfil/editar`, el formulari de la primera entrada i la
-- correcció de noms de la junta— i l'error no assenyala enlloc l'acte que el
-- va causar. És pitjor que un `drop` bloquejat, perquè el bloqueig es veu a
-- l'instant i això no. Les RPC `security definer` sí que segueixen anant, que
-- la guarda es retira pel `current_user` abans d'arribar a la branca, i això
-- encara ho fa més difícil de veure: `redeem_invite()` no es queixa.
--
-- Per això la primera sentència d'aquest fitxer torna la guarda a la versió del
-- 07 —la que no anomena la columna— i només després cau la columna. Així
-- executar-lo tot sol deixa la base coherent, sense haver de recordar res.
--
-- SI NOMÉS VOLS DESFER LA 79 i quedar-te la columna, aquest no és el fitxer:
-- és `rollbacks/79_l_instagram_es_de_qui_el_porta.sql`, que a més torna el
-- comentari de la columna al text de la 70. Aquí no es pot tornar cap
-- comentari, perquè no hi haurà cap columna a comentar.
--
-- SI LES DESFÀS TOTES DUES, AQUEST VA L'ÚLTIM. El rollback de la 79 acaba amb
-- un `comment on column public.profiles.instagram`, i amb la columna ja
-- esborrada aquella sentència peta amb un 42703.
--
-- ORDRE respecte del desplegament. Primer el client ha de deixar de demanar la
-- columna —el `select` de `src/features/session/profile.ts` l'enumera per nom i
-- un `drop column` amb la versió antiga desplegada torna un 42703 a cada
-- càrrega de perfil— i després això. A l'inrevés, l'app peta entre el drop i el
-- desplegament.
--
-- Desfer-ho vol dir que `/soci/:id` es queda sense la fila per seguir, que
-- `/perfil` perd la fila d'ajustos i que l'alta torna a demanar quatre coses.

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

alter table public.profiles drop column if exists instagram;

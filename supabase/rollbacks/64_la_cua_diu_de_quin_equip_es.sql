-- Rollback de la migració 64. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `admin_gimcana_queue` sense `equip_ordre`. La pantalla de validar el
-- llegeix, així que desfer això sense desfer també el client la deixa demanant
-- una columna que no existeix: van juntes.

drop function if exists public.admin_gimcana_queue(uuid);

create function public.admin_gimcana_queue(p_event_id uuid)
returns table (
  id uuid,
  path text,
  prova text,
  punts integer,
  qui text,
  equip text,
  escola text,
  quan timestamptz,
  a_la_cua integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.path,
    p.titol,
    p.punts,
    pr.nombre,
    e.nom,
    e.escola,
    s.created_at,
    count(*) over ()::int
  from public.gimcana_enviaments s
  join public.gimcana_proves p on p.id = s.prova_id
  join public.gimcanes g on g.id = p.gimcana_id
  join public.profiles pr on pr.id = s.user_id
  join public.gimcana_equips e on e.id = s.equip_id
  where g.event_id = p_event_id
    and s.estat = 'pendent'
    and (select private.is_admin())
  order by s.created_at
$$;

revoke all on function public.admin_gimcana_queue(uuid) from public, anon;
grant execute on function public.admin_gimcana_queue(uuid) to authenticated;

-- I la 63, si es desfà la mateixa tanda:
-- supabase/rollbacks/63_la_cua_de_la_gimcana_es_feina.sql

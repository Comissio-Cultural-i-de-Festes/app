-- La cua de validació diu de quin equip és cada foto.
--
-- EL QUE PASSAVA. La pantalla de validar pintava «Equip 1» a totes les fotos,
-- fos quin fos l'equip que les havia enviades. El nom hi era —la funció ja
-- tornava `e.nom`— però la columna es diu `equip` i la pantalla el buscava a
-- `nom`: com que el tipus del client tenia el camp opcional, no hi havia res
-- que ho digués, i queia al darrer cas de `teamName`, que és el número d'equip.
-- Amb l'índex escrit a mà a zero, sempre el mateix número.
--
-- Els punts anaven bé —la RPC de validar fa servir l'`equip_id` de l'enviament,
-- no el que surt a la pantalla— i el que fallava era el que llegia la persona:
-- validant a mitja festa, totes les fotos semblaven del mateix equip.
--
-- L'ARREGLO DEL NOM ÉS AL CLIENT. Aquí hi ha l'altra meitat, la que el client
-- no es pot inventar: **l'ordre de l'equip**. `admin_shuffle_teams` crea els
-- equips amb `nom` a NULL, i llavors l'única manera d'anomenar-los és el
-- número —«Equip 3»—, que és el seu `ordre`. La cua no el tornava, i per això
-- la pantalla no tenia cap número correcte per a posar-hi encara que hagués
-- llegit el camp bo.
--
-- `ordre` compta des d'1 (`for v_i in 1..p_quants` a `admin_shuffle_teams`).
--
-- Cal DROP i no `create or replace`: canviar les columnes d'un `returns table`
-- no es pot fer amb replace.

drop function if exists public.admin_gimcana_queue(uuid);

create function public.admin_gimcana_queue(p_event_id uuid)
returns table (
  id uuid,
  path text,
  prova text,
  punts integer,
  qui text,
  equip text,
  equip_ordre integer,
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
    e.ordre,
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

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/64_la_cua_diu_de_quin_equip_es.sql, que torna la funció
-- sense `equip_ordre`. Desfer-ho sense desfer el client deixa la pantalla
-- demanant una columna que no hi és: van juntes.

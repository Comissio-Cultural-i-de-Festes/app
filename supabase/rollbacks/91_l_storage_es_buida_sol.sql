-- Rollback de la migració 91. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Para la marca de les proves de la gimcana, treu el que diu què sobra de
-- Storage i torna la cua de validar com era a la 64. Els objectes que ja
-- s'hagin esborrat no tornen: l'storage no té paperera.
--
-- La columna `foto_esborrada_at` se'n va amb les marques que portés. Si es
-- torna a aplicar la 91, el primer `cron` les torna a posar, perquè la regla
-- es calcula de l'horari i no de cap estat.
--
-- El client que crida `my_storage_garbage` en segon pla rep un error i no fa
-- res: no cal desfer-lo alhora.

select cron.unschedule('marca-proves-gimcana')
where exists (select 1 from cron.job where jobname = 'marca-proves-gimcana');

drop function if exists private.mark_gimcana_photos_gone();
drop function if exists public.my_storage_garbage(integer);
drop function if exists private.storage_garbage();

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

alter table public.gimcana_enviaments drop column if exists foto_esborrada_at;

drop function if exists private.uuid_or_null(text);
drop function if exists private.gimcana_tancada_a(uuid);

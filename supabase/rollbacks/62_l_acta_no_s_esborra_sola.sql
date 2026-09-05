-- Rollback de la migració 62. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `admin_close_meeting` al `set acta = excluded.acta` de sempre, o sigui
-- que tornar a tancar una reunió sense enviar `p_acta` torna a esborrar l'acta.
-- Només val la pena si la 62 trenca una altra cosa.
--
-- Cos idèntic al de la 62 tret del `on conflict` i del `amb_acta`.

create or replace function public.admin_close_meeting(
  p_event_id uuid,
  p_user_ids uuid[],
  p_acta text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_event  public.events%rowtype;
  v_punts  int := 0;
  v_gent   int := 0;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;
  if v_event.tipo <> 'reunio' then
    raise exception 'nomes es tanquen reunions' using errcode = '22023';
  end if;

  insert into public.attendances (user_id, event_id, estado)
  select u, p_event_id, 'asistio'
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
  on conflict (user_id, event_id) do update set estado = 'asistio';

  update public.attendances
     set estado = 'no'
   where event_id = p_event_id
     and estado = 'asistio'
     and not (user_id = any (coalesce(p_user_ids, '{}'::uuid[])));

  select count(*)::int into v_gent
    from public.attendances
   where event_id = p_event_id and estado = 'asistio';

  if v_event.abast = 'comi' and v_event.puntos > 0 then
    insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
    select u, p_event_id, 'asistencia', v_event.puntos, v_actor
      from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
    on conflict do nothing;

    select count(*)::int * v_event.puntos into v_punts
      from public.points_log
     where event_id = p_event_id and motivo = 'asistencia';
  end if;

  insert into public.event_details (event_id, acta)
  values (p_event_id, nullif(btrim(coalesce(p_acta, '')), ''))
  on conflict (event_id) do update set acta = excluded.acta;

  update public.events set tancada_at = now() where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    v_actor,
    'close_meeting',
    p_event_id,
    jsonb_build_object(
      'abast', v_event.abast,
      'hi_eren', v_gent,
      'punts_per_persona', case when v_event.abast = 'comi' then v_event.puntos else 0 end,
      'amb_acta', nullif(btrim(coalesce(p_acta, '')), '') is not null
    )
  );

  return jsonb_build_object('hi_eren', v_gent, 'punts', v_punts);
end $$;

revoke all on function public.admin_close_meeting(uuid, uuid[], text) from public, anon;
grant execute on function public.admin_close_meeting(uuid, uuid[], text) to authenticated;

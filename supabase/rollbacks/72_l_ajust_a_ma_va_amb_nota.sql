-- Rollback de la migració 72. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `award_points` a la versió de la 15: `manual` sense nota torna a ser
-- legal, restar torna a ser només de l'owner per a qualsevol motiu, i el
-- detall de l'auditoria torna a no dir per què.
--
-- Les files ja escrites es queden: `points_log` és append-only per disparador
-- i un ajust amb nota continua sent una fila vàlida. El que desfà això és la
-- garantia cap endavant, no el passat.

create or replace function public.award_points(
  p_user_id uuid,
  p_event_id uuid,
  p_motivo text,
  p_puntos int,
  p_nota text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;
  if p_puntos < 0 and not private.is_owner() then
    raise exception 'nomes owner pot restar punts' using errcode = '42501';
  end if;

  insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
  values (p_user_id, p_event_id, p_motivo, p_puntos, p_nota, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'award_points',
    p_user_id,
    jsonb_build_object('motiu', p_motivo, 'punts', p_puntos, 'esdeveniment', p_event_id)
  );

  return v_id;
end $$;

comment on function public.award_points(uuid, uuid, text, int, text) is null;

revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

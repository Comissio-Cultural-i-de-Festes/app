-- Rollback de la migració 76. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `award_points` a la versió de la 72: `conduir` torna a ser un motiu
-- que es pot crear per una crida a mà. Tota la resta —nota obligatòria a
-- `manual`, resta oberta als admins només per `manual`, la nota al detall de
-- l'auditoria— es queda, perquè és de la 72 i no d'aquí.
--
-- Les files ja escrites no es toquen: `points_log` és append-only per
-- disparador, i de totes maneres el CHECK sempre ha acceptat `conduir`. El que
-- desfà això és la garantia cap endavant, no el passat.
--
-- SI TAMBÉ ES DESFÀ LA 71, AQUEST FITXER VA PRIMER. Al revés, hi hauria un
-- moment amb la fila de `conduir` tornada a `point_values` —o sigui un botó
-- dibuixat a la porta— i `award_points` encara refusant-lo: el botó existiria i
-- contestaria 22023 a qui el premés.

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
declare
  v_id   uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
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
  if p_motivo = 'manual' and v_nota is null then
    raise exception 'un ajust a ma vol una nota' using errcode = '22023';
  end if;
  if p_puntos < 0 and p_motivo <> 'manual' and not private.is_owner() then
    raise exception 'nomes owner pot restar punts' using errcode = '42501';
  end if;

  insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
  values (p_user_id, p_event_id, p_motivo, p_puntos, v_nota, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'award_points',
    p_user_id,
    jsonb_build_object(
      'motiu', p_motivo,
      'punts', p_puntos,
      'esdeveniment', p_event_id,
      'nota', v_nota
    )
  );

  return v_id;
end $$;

comment on function public.award_points(uuid, uuid, text, int, text) is
  'Escriu una fila al llibre major. `manual` exigeix nota i és l''unic motiu '
  'pel qual un admin pot restar; per als altres, restar continua sent de '
  'l''owner. La nota es desa a points_log.nota i al detall de l''auditoria.';

revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

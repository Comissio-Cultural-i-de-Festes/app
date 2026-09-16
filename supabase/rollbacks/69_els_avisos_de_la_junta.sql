-- Rollback de la migració 69. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- QUÈ DESFÀ, I EN QUIN ORDRE. Primer les dues taules, que és el que fa que els
-- motius nous del llibre major quedin sense ningú que els escrigui; després la
-- tornada d'`award_points` al criteri de la migració 15, on restar demanava ser
-- owner; i al final les dues allowlists, que no es poden estrènyer mentre hi
-- hagi files que les violin.
--
-- I PER AIXÒ ESBORRA LES FILES DE `points_log` DELS DOS MOTIUS NOUS. És l'única
-- part d'aquest fitxer que perd informació, i es fa perquè no hi ha alternativa:
-- la constraint no es pot tornar a estrènyer amb files de motiu `avis` a dins.
-- Si això s'ha d'executar amb avisos ja posats, el que s'ha de fer abans és
-- guardar-se'ls; aquí es diu i no s'amaga.

-- ── les files que impedirien estrènyer l'allowlist ──────────────────────────
delete from public.points_log where motivo in ('avis', 'avis_retirat');

-- ── les dues taules ────────────────────────────────────────────────────────
drop function if exists public.retira_avis(uuid, text);
drop function if exists public.avisa(uuid, text, text, int, uuid);
drop function if exists public.admin_set_avis_tipus(text, int, int, int, text, boolean);

drop table if exists public.avisos;
drop table if exists public.avis_tipus;

-- ── el llindar i el sostre ─────────────────────────────────────────────────
delete from public.point_values where mena = 'avisos';

alter table public.point_values drop constraint point_values_mena_check;
alter table public.point_values add constraint point_values_mena_check
  check (mena in ('motiu', 'tipus_esdeveniment'));

-- ── el llibre major torna als sis motius ───────────────────────────────────
alter table public.points_log drop constraint points_log_motivo_check;
alter table public.points_log add constraint points_log_motivo_check
  check (motivo in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual'));

-- ── i `award_points` torna a demanar l'owner per restar ────────────────────
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
as $fn$
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
  -- Corrections are compensating rows, and taking points away is the kind of
  -- thing that starts arguments, so it needs the higher role.
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
end $fn$;

-- ── i el registre torna a les vint-i-quatre accions de la 67 ───────────────
delete from public.audit_log where accio in ('avis', 'retira_avis', 'set_avis_tipus');

alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'award_points',
    'check_in_here',
    'close_meeting',
    'create_event',
    'create_invite',
    'decide_attendance',
    'decide_proposal',
    'delete_event',
    'delete_grau',
    'edit_event',
    'hores_persona',
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
    'set_estat',
    'set_hores',
    'set_paid',
    'set_point_value',
    'set_published',
    'set_role',
    'transfer_owner',
    'undo_checkin',
    'visa_hores'
  ));

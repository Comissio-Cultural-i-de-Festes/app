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
--
-- ── ORDRE: LA 76 I LA 77 VAN PRIMER, TOTES DUES ─────────────────────────────
--
-- El cos d'aquí és el de la 15 i després de la 72 hi ha hagut dues migracions
-- més sobre `award_points`. Aplicat tal qual sobre una base amb les tres, les
-- desfà les tres i només una era la intenció:
--
--   · la 76 tornaria: `conduir` un altre cop creable per una crida a mà, que és
--     el tercer forat de la issue #2 i el que la 71 va deixar obert a posta;
--   · la 77 tornaria: la nota es netejaria amb el `btrim` d'un sol argument, que
--     només treu U+0020. Aquí no hi ha cap verja de nota a desfer —és el cos de
--     la 15, que no en té— però el que se'n va amb ella és la funció que ho
--     decideix, i qualsevol cosa que després es reescrigui sobre aquest cos se
--     l'endurà.
--
-- La 76 i la 77 es van escriure totes dues sobre el cos de la 72, o sigui que
-- desfer-les abans és l'ordre natural i no un apedaçat. No hi ha un rollback de
-- la 77 a aquest directori i és a posta: no és el desfer d'una decisió de
-- producte, és una correcció de seguretat, i qui la vulgui desfer ha d'escriure
-- ell el fitxer i signar-lo.
--
-- Això no és una precaució teòrica: el rollback de la 76 va portar exactament
-- aquest defecte durant una revisió —el cos de la 72, que desfeia la 77 sense
-- dir-ho— i el va tapar posant-hi el cos de la 77 amb l'allowlist tornada
-- enrere. Aquí aquella sortida no serveix, perquè el que aquest fitxer desfà és
-- justament la nota obligatòria. `tests/rollbacks-cos-al-dia.test.ts` comprova
-- que aquest avís hi sigui.

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

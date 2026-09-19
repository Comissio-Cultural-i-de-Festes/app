-- Rollback de la migració 76. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `conduir` a l'allowlist d'`award_points`: un motiu que es pot crear per
-- una crida a mà. Tota la resta es queda.
--
-- ── ORDRE, I EL QUE AQUEST FITXER VA ESTAR A PUNT DE DESFER SOL ─────────────
--
-- LA 77 NO ES DESFÀ AQUÍ, i durant una revisió ho feia. La primera versió
-- d'aquest fitxer era el cos de la 72 copiat, perquè la 72 era el cos de
-- referència el dia que la 76 es va escriure. Quan la 77 va canviar
-- `award_points` per corregir la neteja de la nota, aquest fitxer es va quedar
-- amb la línia vella —`nullif(btrim(coalesce(p_nota, '')), '')`, que treu U+0020
-- i cap altre blanc— i un `create or replace` no avisa: desfer la 76 tornava a
-- obrir el forat del tabulador en silenci, i amb ell la verja sencera del
-- negatiu. Amb `p_motivo:'manual'`, `p_puntos:-500` i `p_nota:E'\t'`, un admin
-- que no és l'owner escrivia la fila i el «per què» quedava en blanc.
--
-- Un rollback que et deixa una vulnerabilitat oberta sense dir-ho és pitjor que
-- no tenir-ne cap. Per això ara el cos d'aquí és el de la 77, línia per línia,
-- amb l'allowlist tornada enrere i res més: la nota la neteja
-- `private.nota_neta` com a la 77, `manual` continua exigint-ne una que es
-- vegi, i restar per un motiu que no sigui `manual` continua sent de l'owner.
-- NO cal desfer la 77 abans, i no s'ha de desfer: no és el desfer d'una decisió
-- de producte, és una correcció de seguretat.
--
-- ES DEIXA ESCRIT AQUÍ per a qui l'executi i per a qui el reescrigui. La regla
-- que això inaugura val per a tots els rollbacks d'aquest directori: el cos
-- d'un rollback de la migració N és el de la ÚLTIMA migració que toca aquella
-- funció, no el de la N−1. `tests/rollbacks-cos-al-dia.test.ts` ho comprova
-- sobre els fitxers, que és l'únic lloc on es pot comprovar sense executar-los.
--
-- SI LA BASE NO TÉ LA 77 —una base aturada entre la 76 i la 77, que és l'únic
-- cas on això pot passar—, `private.nota_neta` no existeix i el `create or
-- replace` d'aquí crearia una `award_points` que peta a la primera crida:
-- `check_function_bodies` no resol les crides de dins d'un cos plpgsql. El
-- `do` de sota ho mira abans i s'atura amb un missatge en comptes de deixar la
-- porta trencada.
--
-- SI TAMBÉ ES DESFÀ LA 71, AQUEST FITXER VA PRIMER. Al revés, hi hauria un
-- moment amb la fila de `conduir` tornada a `point_values` —o sigui un botó
-- dibuixat a la porta— i `award_points` encara refusant-lo: el botó existiria i
-- contestaria 22023 a qui el premés.
--
-- Les files ja escrites no es toquen: `points_log` és append-only per
-- disparador, i de totes maneres el CHECK sempre ha acceptat `conduir`. El que
-- desfà això és la garantia cap endavant, no el passat.

do $guard$
begin
  if to_regprocedure('private.nota_neta(text)') is null then
    raise exception
      'falta private.nota_neta: aquest rollback porta el cos de la 77 i aquesta base no la te'
      using errcode = '42883';
  end if;
end $guard$;

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
  v_nota text := private.nota_neta(coalesce(p_nota, ''));
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  -- Amb `conduir`: és l'única línia que aquest fitxer desfà.
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;
  -- Un ajust a mà sense el per què és un número que ha aparegut. I un per què
  -- que no es veu és un per què que no s'hi ha escrit: ho decideix
  -- `private.nota_neta`, no `btrim`. Migració 77, i es queda.
  if p_motivo = 'manual' and v_nota is null then
    raise exception 'un ajust a ma vol una nota' using errcode = '22023';
  end if;
  -- Restar per un dels motius de la porta continua sent cosa de l'owner: allà
  -- no hi ha cap lloc on escriure per què, i una resta muda no es pot
  -- respondre. Per `manual` hi ha nota obligatòria dues línies més amunt, i
  -- amb nota la junta sencera hi arriba.
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
  'Escriu una fila al llibre major. Sis motius, `conduir` inclos. `manual` '
  'exigeix nota —una nota que es vegi, no un blanc— i es l''unic motiu pel qual '
  'un admin pot restar; per als altres, restar continua sent de l''owner. La '
  'nota es desa a points_log.nota i al detall de l''auditoria.';

revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

-- `conduir` deixa de poder-se crear: la tercera llista, tancada.
--
-- EL DEUTE QUE PAGA. La 71 va treure `conduir` de `point_values` i va deixar
-- escrit, negre sobre blanc, que treure'l de l'allowlist d'`award_points`
-- quedava «per a una migració a part, un cop les dues siguin a main». Les dues
-- són la 71 i la 72 —la nota obligatòria dels ajustos a mà—, i totes dues hi
-- són. El motiu del diferiment era bo i ara ja no val: aleshores la 72 encara
-- no havia arribat, i un `create or replace` escrit sobre el cos de la 15
-- hauria desfet en silenci la nota obligatòria. Avui el cos de referència és el
-- de la 72 i es pot copiar sencer.
--
-- LES TRES LLISTES, I ON QUEDEN. La 71 explica per què no es mouen juntes; el
-- que canvia aquí és només la de dalt:
--
--   allowlist d'award_points  què es pot CREAR ara     → `conduir` FORA (aquí)
--   files de point_values     quins botons es DIBUIXEN → fora des de la 71
--   CHECK de points_log       què pot EXISTIR          → `conduir` HI ÉS, i s'hi queda
--
-- EL `CHECK` NO ES TOCA, i continua sense tocar-se per sempre. Al llibre major
-- hi ha files de desembre amb `motivo = 'conduir'`; retallar la constraint
-- obligaria a validar-les i petaria el desplegament. La migració 61 existeix
-- justament perquè el llibre major sobrevisqui a la resta, i l'i18n es queda
-- igual perquè una fila de desembre ha de sortir al perfil amb la seva etiqueta
-- i no amb la clau en majúscules.
--
-- QUÈ TANCA DE DEBÒ. Des de la 71, `conduir` no és cap botó i la pantalla de
-- l'escala no el pot tornar a inventar —`admin_set_point_value` no insereix
-- files—. El que quedava obert era una crida a mà: `award_points` té el grant
-- per a `authenticated` sencer, o sigui que qualsevol de la junta podia obrir
-- la consola del navegador i escriure `p_motivo: 'conduir'` amb els punts que
-- volgués. Avui no ho fa ningú; el forat no es tanca perquè s'estigui fent
-- servir, sinó perquè una regla que només viu al fet que ningú la provi no és
-- una regla.
--
-- DESCARTAT: fer que l'allowlist es llegís de `point_values` en comptes de ser
-- una llista literal, que hauria fet que les tres llistes no es poguessin tornar
-- a desincronitzar mai més. No s'ha fet perquè dos dels sis motius no hi tenen
-- fila —`asistencia` la posa el fitxatge i `manual` l'ajust a mà, i cap dels dos
-- és un botó de l'escala—, o sigui que la consulta hauria acabat sent la taula
-- més dues excepcions escrites a mà: la mateixa llista literal amb una consulta
-- al davant i una condició de carrera nova, que un `delete` a l'escala fes
-- fallar una crida en vol.
--
-- LA SIGNATURA NO CANVIA, i per això és un `create or replace` i prou. Un
-- paràmetre nou amb valor per defecte crearia una SOBRECÀRREGA i PostgREST
-- contestaria PGRST203 a totes les crides, també a les de la porta. El cos és
-- el de la 72 amb sis caràcters de menys: la nota obligatòria de `manual` i la
-- verja del negatiu es queden exactament com estaven.

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
  -- Sense `conduir`: portar gent és l'únic motiu de cotxe que es pot donar.
  -- El CHECK de `points_log` sí que l'accepta encara, i és a posta: el que
  -- pot existir i el que es pot crear avui no són la mateixa llista.
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;
  -- Un ajust a mà sense el per què és un número que ha aparegut.
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
  'Escriu una fila al llibre major. Cinc motius: `conduir` ja no es pot crear '
  '—el CHECK de points_log encara l''accepta, que l''historic no es reescriu—. '
  '`manual` exigeix nota i es l''unic motiu pel qual un admin pot restar; per '
  'als altres, restar continua sent de l''owner.';

-- `create or replace` conserva els privilegis, però es tornen a escriure aquí
-- perquè la frase que importa —qui pot executar-la— es llegeixi al mateix
-- fitxer que canvia què fa.
revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

-- Un ajust a mà va amb nota, i restar deixa de ser cosa d'una sola persona.
--
-- EL FORAT QUE TAPA. `award_points` sap fer `manual`, sap fer negatius i sap
-- guardar una nota des de la 15, i el client no feia servir res de les tres
-- coses: els quatre botons de la porta, sempre en positiu, sempre sense nota.
-- O sigui que corregir un error volia dir obrir la base de dades. La pantalla
-- de punts ho arribava a prometre per escrit —«els pots treure des del perfil
-- de la persona»— i aquell perfil no existia.
--
-- DUES REGLES NOVES, i totes dues viuen aquí i no al navegador.
--
-- 1. `manual` VOL NOTA. És l'única cosa que separa un ajust d'un número que
--    ha aparegut. Una validació de formulari la pot saltar qualsevol amb la
--    consola oberta i, sobretot, no lliga el futur: demà hi haurà una segona
--    pantalla que cridi la mateixa RPC i la garantia ha de continuar sent
--    certa. Es comprova amb `btrim` perquè una nota de tres espais és una
--    nota buida amb una altra cara.
--
-- 2. UN ADMIN POT RESTAR, PERÒ NOMÉS PER `manual`. La 15 reservava tot el
--    negatiu a l'owner, i el motiu que hi va escriure continua sent bo:
--    «taking points away is the kind of thing that starts arguments». El que
--    ha canviat és que ara una resta per `manual` no pot existir sense nota i
--    sense fila al registre, i és això —no el rol de qui la fa— el que
--    contesta la discussió del març. Els quatre botons de la porta no hi
--    entren: allà un negatiu continua sent cosa de l'owner, perquè allà no hi
--    ha cap lloc on escriure per què.
--
--    DESCARTAT: obrir el negatiu sencer als admins. Hauria estat una línia
--    menys, a canvi de perdre l'única garantia que fa que la resta sigui
--    defensable. Un «-20 muntatge» sense text no es pot respondre.
--
-- I LA NOTA AL `detall` DE L'AUDITORIA. Sense això el registre continuava
-- dient que havien passat vint punts i no per què, que és l'única part que
-- algú preguntarà. La fila de `points_log` ja la guardava; el registre és el
-- lloc on es llegeix sense mirar el llibre major d'un altre.
--
-- LA SIGNATURA NO CANVIA, i és deliberat: `p_nota` ja hi era des de la 15. Un
-- paràmetre nou amb valor per defecte hauria creat una SOBRECÀRREGA i
-- PostgREST hauria contestat PGRST203 a totes les crides, també a les de la
-- porta. Per això això és un `create or replace` i prou.

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
  'Escriu una fila al llibre major. `manual` exigeix nota i és l''unic motiu '
  'pel qual un admin pot restar; per als altres, restar continua sent de '
  'l''owner. La nota es desa a points_log.nota i al detall de l''auditoria.';

-- `create or replace` conserva els privilegis, però es tornen a escriure aquí
-- perquè la frase que importa —qui pot executar-la— es llegeixi al mateix
-- fitxer que canvia què fa.
revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

-- La tercera porta, que es fitxa des del lloc.
--
-- La migració 49 en va tancar dues i va posar la regla dels punts al
-- disparador de `points_log` justament perquè no calgués trobar-les totes. Va
-- servir: quan va sortir aquesta, els punts ja no hi passaven.
--
-- El que el disparador no cobreix és la fila d'`attendances`, i aquí sí que
-- importa. `check_in_here` és `security definer` i llegeix `public.events`
-- sense passar per l'RLS —ho ha de fer, perquè comprova la finestra i el punt
-- geogràfic—, així que la política que amaga les reunions de junta no hi diu
-- res. Un soci que en sabés l'identificador i fos a prop del lloc s'afegia al
-- llistat de qui hi era.
--
-- I com a la porta, val per a les dues menes: qui era a una reunió ho diu qui
-- la tanca.

CREATE OR REPLACE FUNCTION public.check_in_here(p_event_id uuid, p_lat double precision, p_lng double precision, p_precisio_m double precision DEFAULT NULL::double precision, p_client_request_id uuid DEFAULT NULL::uuid, p_taken_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me      uuid := (select auth.uid());
  v_event   public.events%rowtype;
  v_geo     private.event_geo%rowtype;
  v_att     public.attendances%rowtype;
  v_window  tsrange;
  v_at      timestamptz;
  v_dist    double precision;
  v_margin  double precision;
  v_was_reg boolean;
  v_points  int := 0;
  v_new_id  uuid;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  if p_lat is null or p_lng is null then
    raise exception 'calen coordenades' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('checkin:' || p_event_id::text));

  select * into v_event from public.events where id = p_event_id;
  if not found or not v_event.published then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- I UNA REUNIÓ TAMPOC ES FITXA DES DEL LLOC. Aquesta funció és `definer` i
  -- llegeix `events` sense passar per l'RLS, o sigui que la política que amaga
  -- les reunions de junta no la protegeix: qui en sabés l'identificador i fos
  -- a prop del punt es podria posar a la llista d'una reunió on no és. Els
  -- punts ja els para el disparador de `points_log`, però la fila
  -- d'assistència s'hi escrivia igual, i sortir al llistat de qui hi era és
  -- precisament el que la reunió de junta no ha d'ensenyar.
  --
  -- Torna `no_hi_es` i no aixeca: aquí, a diferència de la porta, qui crida és
  -- un soci amb el mòbil a la mà, i la resposta honesta a «sóc aquí?» quan
  -- l'esdeveniment no és seu és la mateixa que si no existís.
  if v_event.tipo = 'reunio' then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- L'hora que val. `p_taken_at` la posa el client per als fitxatges que van
  -- sortir de la cua sense cobertura, o sigui que no es creu: mai al futur, i
  -- ha de caure dins de la finestra igualment. L'hora de debò queda a
  -- l'audit_log, que l'escriu el servidor.
  v_at := least(coalesce(p_taken_at, now()), now());

  v_window := private.checkin_open_at(p_event_id);
  if not v_window @> (v_at at time zone 'UTC') then
    return jsonb_build_object(
      'estat', 'tancat',
      'obre', lower(v_window),
      'tanca', upper(v_window)
    );
  end if;

  select * into v_geo from private.event_geo where event_id = p_event_id;
  if not found then
    return jsonb_build_object('estat', 'sense_lloc');
  end if;

  -- El marge d'error del propi mòbil compta. Dins d'un edifici el GPS dóna
  -- entre vint i cent metres, i sense això hi hauria gent dreta a la sala a
  -- qui l'app li diria que no hi és. Amb un topall, perquè un mòbil no es
  -- guanyi el fitxatge declarant una precisió absurda.
  v_margin := least(greatest(coalesce(p_precisio_m, 0), 0), 250);
  v_dist := private.distance_m(p_lat, p_lng, v_geo.lat, v_geo.lng);

  if v_dist > v_geo.radi_m + v_margin then
    return jsonb_build_object(
      'estat', 'lluny',
      'metres', round(v_dist)::int,
      'radi', v_geo.radi_m
    );
  end if;

  select * into v_att
  from public.attendances
  where user_id = v_me and event_id = p_event_id
  for update;

  if found and v_att.checked_in_at is not null then
    return jsonb_build_object('estat', 'ja_hi_ets', 'quan', v_att.checked_in_at);
  end if;

  -- `was_registered` fals marca un walk-in, que és el que fa que la junta
  -- pugui reconciliar. No es refusa per capacitat: qui és dret a la sala hi
  -- és, i dir-li que no hi cap és discutir amb la realitat.
  v_was_reg := found and v_att.estado in ('si', 'potser', 'espera');

  if found then
    update public.attendances
       set estado = 'asistio',
           prev_estado = v_att.estado,
           checked_in_at = coalesce(checked_in_at, v_at),
           checked_in_by = coalesce(checked_in_by, v_me),
           was_registered = v_was_reg,
           checkin_via = 'ubicacio',
           checkin_lat = p_lat,
           checkin_lng = p_lng,
           checkin_precisio_m = p_precisio_m,
           checkin_dist_m = v_dist
     where user_id = v_me and event_id = p_event_id
    returning id into v_new_id;
  else
    insert into public.attendances (
      user_id, event_id, estado, checked_in_at, checked_in_by, was_registered,
      checkin_via, checkin_lat, checkin_lng, checkin_precisio_m, checkin_dist_m
    )
    values (
      v_me, p_event_id, 'asistio', v_at, v_me, false,
      'ubicacio', p_lat, p_lng, p_precisio_m, v_dist
    )
    returning id into v_new_id;
  end if;

  -- Idempotent pel mateix motiu que `check_in()`: la cua d'IndexedDB pot
  -- reenviar el mateix fitxatge i ha de pagar una sola vegada.
  insert into public.points_log (
    user_id, event_id, motivo, puntos, granted_by, client_request_id
  )
  values (
    v_me, p_event_id, 'asistencia', v_event.puntos, v_me, p_client_request_id
  )
  on conflict do nothing
  returning puntos into v_points;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    v_me,
    'check_in_here',
    p_event_id,
    jsonb_build_object(
      'lat', p_lat,
      'lng', p_lng,
      'precisio_m', p_precisio_m,
      'dist_m', round(v_dist)::int,
      'declarada', v_at,
      'walkin', not v_was_reg
    )
  );

  return jsonb_build_object(
    'estat', 'fet',
    'punts', coalesce(v_points, 0),
    'metres', round(v_dist)::int,
    'walkin', not v_was_reg
  );
end $function$;

-- ── i les respostes, que és per on es veia qui hi ha a la junta ──────────────
-- Aquestes tres polítiques comproven que l'esdeveniment estigui publicat, i
-- fins ara publicat i visible eren el mateix. Amb les reunions de junta ja no:
-- `events_select_member` en filtra les files, però aquests predicats miren
-- `attendances` i criden `private.event_is_published`, que és `definer` i no
-- passa per aquella política.
--
-- La pitjor de les tres és la de lectura. `att_select_public_si` deixa llegir
-- qui ha dit que sí a qualsevol esdeveniment publicat, o sigui que amb
-- l'identificador d'una reunió de junta se'n treia la llista de qui hi va —que
-- és, exactament, qui és de la junta i qui hi serà. La regla del disseny és
-- que un soci no la vegi «ni sabent-ne l'enllaç», i saber-ne l'enllaç és tot
-- el que calia.
--
-- Les altres dues deixaven escriure-hi: apuntar-se a una reunió que no es pot
-- veure, o moure una resposta que ja es tenia cap a una. Cap de les dues
-- ensenya res per si sola, però són files en un esdeveniment que no és seu.
--
-- Als altres esdeveniments no hi canvia res: `event_is_junta_only` només és
-- certa per a una reunió amb `abast = 'junta'`.
drop policy att_select_public_si on public.attendances;

create policy att_select_public_si on public.attendances
  for select to authenticated
  using (
    (select private.is_active_member())
    and estado = any (array['si', 'asistio'])
    and private.event_is_published(event_id)
    and not private.event_is_junta_only(event_id)
  );

drop policy att_insert_self on public.attendances;

create policy att_insert_self on public.attendances
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado = any (array['si', 'potser', 'no', 'espera', 'sollicitat'])
    and private.event_is_published(event_id)
    and not private.event_is_junta_only(event_id)
    and (estado <> 'si' or (private.event_has_room(event_id)
                            and not private.event_needs_confirming(event_id)))
    and (estado <> 'espera' or not private.event_has_room(event_id))
    and (estado <> 'sollicitat' or private.event_needs_confirming(event_id))
  );

drop policy att_update_self on public.attendances;

create policy att_update_self on public.attendances
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado <> all (array['asistio', 'cancelado'])
  )
  with check (
    user_id = (select auth.uid())
    and estado = any (array['si', 'potser', 'no', 'espera', 'sollicitat'])
    and not private.event_is_junta_only(event_id)
    and (estado <> 'si' or (private.event_has_room(event_id)
                            and not private.event_needs_confirming(event_id)))
    and (estado <> 'espera' or not private.event_has_room(event_id))
    and (estado <> 'sollicitat' or private.event_needs_confirming(event_id))
  );

-- La junta fitxa a la seva reunió.
--
-- EL QUE PASSAVA. El dia de la reunió de junta, l'app ensenyava «Sóc aquí» —
-- `EventScreen` obre el bloc per a qualsevol esdeveniment dins de la finestra —
-- i en prémer-lo contestava que l'esdeveniment no existia. La migració 50 havia
-- posat `if tipo = 'reunio' then return no_hi_es` per a TOTES les reunions, i
-- la junta, que és a la sala amb el mòbil a la mà, no podia dir que hi era.
--
-- ── DEPARTURE FROM MIGRATION 50 ─────────────────────────────────────────────
-- El que la 50 volia evitar era concret: que un soci de FORA de la junta que
-- sabés l'identificador i fos a prop del punt s'afegís a la llista d'una reunió
-- on no és convocat. Per tapar-ho va tancar la porta a tothom, inclosos els
-- convocats. Aquí es torna a obrir només per a qui hi és convocat, amb la mateixa
-- regla que ja fa servir `meeting_roster` (migració 48): una reunió de comi, tot
-- soci actiu; una de junta, només la junta. Qui no hi és convocat continua
-- rebent `no_hi_es`, que és la resposta de la 50 i la que no revela res.
--
-- «Qui hi era ho diu qui la tanca» continua sent cert: fitxar només deixa la
-- fila d'`attendances` a `asistio`, que `CloseMeetingScreen` ja pre-marca, i qui
-- tanca la reunió la pot desmarcar. El que ha canviat és que el mòbil de qui hi
-- és ja no ha de callar.
--
-- ELS PUNTS NO ES TOQUEN DES D'AQUÍ, i per a les dues menes de reunió:
--
--   · De junta: `points_log_no_junta_meetings` (migració 49) AIXECA en inserir
--     punts d'una reunió de junta. Sense saltar-se l'insert, obrir la porta
--     hauria canviat «no existeix» per un error, que no és cap arreglament.
--   · De comi: els reparteix `admin_close_meeting` en tancar-la, perquè «qui diu
--     que hi serà i no hi és, no en fa». Donar-los aquí faria que desmarcar algú
--     en tancar-la no els hi tragués, perquè el tancament no esborra punts.
--
-- Rebutjat: amagar el bloc a les reunions des del client. Hauria tret el missatge
-- equivocat, però la junta hauria continuat sense poder dir que hi és, que és el
-- que es demanava.

create or replace function public.check_in_here(
  p_event_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_precisio_m double precision default null,
  p_client_request_id uuid default null,
  p_taken_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  -- UNA REUNIÓ ES FITXA NOMÉS SI HI ETS CONVOCAT. Aquesta funció és `definer` i
  -- llegeix `events` sense passar per l'RLS, o sigui que la política que amaga
  -- les reunions de junta no la protegeix: la regla s'ha de dir aquí. És la de
  -- `meeting_roster` —de comi, tot soci actiu, que ja s'ha comprovat a dalt; de
  -- junta, només la junta— i per a qui no hi és convocat la resposta és la
  -- mateixa que si no existís. Vegeu la nota de dalt del fitxer.
  if v_event.tipo = 'reunio'
     and v_event.abast = 'junta'
     and not private.is_admin() then
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
  --
  -- I una reunió no paga aquí: la de junta no reparteix punts i el disparador
  -- ho aixecaria, i la de comi els dóna qui la tanca. Vegeu la nota de dalt.
  if v_event.tipo <> 'reunio' then
    insert into public.points_log (
      user_id, event_id, motivo, puntos, granted_by, client_request_id
    )
    values (
      v_me, p_event_id, 'asistencia', v_event.puntos, v_me, p_client_request_id
    )
    on conflict do nothing
    returning puntos into v_points;
  end if;

  -- SENSE `lat` NI `lng`: vegeu la migració 65. La distància i el marge d'error
  -- són el que la junta necessita per a jutjar un fitxatge, i no diuen on era
  -- ningú.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    v_me,
    'check_in_here',
    p_event_id,
    jsonb_build_object(
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
end $$;

revoke all on function public.check_in_here(uuid, double precision, double precision,
                                            double precision, uuid, timestamptz)
  from public, anon;
grant execute on function public.check_in_here(uuid, double precision, double precision,
                                               double precision, uuid, timestamptz)
  to authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/83_la_junta_fitxa_a_la_seva_reunio.sql, que torna el cos
-- de la 65 sencer. Les files d'`attendances` que s'hagin fitxat mentrestant es
-- queden: són gent que hi era.

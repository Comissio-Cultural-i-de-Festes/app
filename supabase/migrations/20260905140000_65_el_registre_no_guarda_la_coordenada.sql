-- El registre deixa de guardar la coordenada exacta de qui fitxa.
--
-- LA CONTRADICCIÓ. `attendances.checkin_lat` i `checkin_lng` estan tancades amb
-- privilegis de columna: `authenticated` no té cap GRANT de lectura sobre elles
-- i un soci que ho provi rep «permission denied for table attendances». I
-- `admin_checkins()`, la RPC amb què la junta mira els fitxatges, tampoc no les
-- torna: només `dist_m` i `precisio_m`, a posta.
--
-- I al costat, aquesta mateixa funció escrivia `lat` i `lng` CRUES dins de
-- `audit_log.detall`, que la junta llegeix sencer i que es guarda 24 mesos. La
-- protecció de columna era paper mullat: la coordenada sortia igual, per una
-- altra porta i amb més temps de vida.
--
-- De dues tanques per a la mateixa dada, mana la fluixa. Aquesta és la fluixa.
--
-- QUÈ ES QUEDA. `dist_m`, `precisio_m`, `declarada` i `walkin`. És exactament el
-- que la junta mira a `CheckinsScreen` —«el que va fitxar des de quatre
-- quilòmetres es veu sol»— i el que fa falta per a discutir un fitxatge dubtós.
-- La distància sense el punt de partida no diu on era ningú.
--
-- QUÈ NO ES TOCA. Les columnes d'`attendances`. Allà la coordenada té un motiu
-- —refer el càlcul si el radi del local estava mal posat— i té la tanca que li
-- toca: cap grant per a ningú, només `service_role`.
--
-- I EL QUE JA HI HAVIA ESCRIT. Deixar de fer-ho no esborra el que hi ha, i el
-- que hi ha viu 24 mesos. La segona meitat d'aquesta migració treu les dues
-- claus de les files antigues. És la diferència entre «hem deixat de fer-ho» i
-- «ja no hi és».

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

  -- SENSE `lat` NI `lng`: vegeu la nota de dalt del fitxer. La distància i el
  -- marge d'error són el que la junta necessita per a jutjar un fitxatge, i no
  -- diuen on era ningú.
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

-- ── I el que ja hi havia escrit ─────────────────────────────────────────────

update public.audit_log
   set detall = detall - 'lat' - 'lng'
 where accio = 'check_in_here'
   and (detall ? 'lat' or detall ? 'lng');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/65_el_registre_no_guarda_la_coordenada.sql, que torna
-- les dues claus al `jsonb_build_object`. El que s'ha esborrat de les files
-- antigues NO torna, i és a posta: desfer la funció no ha de ressuscitar unes
-- coordenades que ja s'han tret.

-- Fitxar des del teu propi mòbil, per on ets.
--
-- PER QUÈ CANVIA. Fins ara fitxar era `check_in()`, que només pot cridar la
-- junta amb un QR al davant. Resolia el frau —el que un soci es pot donar sol
-- no val res, i fitxar dóna punts— però ho feia posant una persona de la junta
-- a fer de porter tota la nit, coordinant seixanta mòbils mentre munta
-- l'activitat. Aquesta funció mou la feina al mòbil de cada u.
--
-- EL MODEL DE CONFIANÇA, DIT EN VEU ALTA. La ubicació del navegador es pot
-- falsejar: qualsevol DevTools té un camp per escriure-hi les coordenades que
-- vulguis. O sigui que això NO és una prova d'haver-hi estat, i seria
-- deshonest construir-ho com si ho fos. És una declaració amb un rastre: els
-- punts es donen a l'instant, la fila guarda què va dir el mòbil i què va
-- calcular el servidor, i la junta els pot treure amb `admin_undo_checkin`,
-- que existeix des de la migració 23. Vigilar cent fotos o cent posicions no
-- ho faria ningú; mirar una llista ordenada per distància, sí.
--
-- LES COORDENADES DE L'ESDEVENIMENT NO SURTEN D'AQUÍ. Viuen en una taula
-- pròpia, sense cap grant i amb RLS activat sense cap política, en comptes
-- d'anar a `events`. Dos motius i cadascun ja bastaria:
--
--   `authenticated` té SELECT sobre TOTA la taula `events` — un grant de
--   taula, no de columnes — o sigui que una columna nova allà seria llegible
--   per tothom el mateix dia que s'afegís. És el mateix parany que la migració
--   34 va haver de desfer a `attendances`.
--
--   I un esdeveniment darrere `reveal_at` té el lloc com a part de la sorpresa.
--
-- Que el client no les tingui vol dir també que la regla no és seva: el mòbil
-- diu on és i el servidor decideix. Una comparació que visqui al navegador és
-- una comparació que es pot reescriure.

-- ── on és l'esdeveniment ────────────────────────────────────────────────────
create table if not exists private.event_geo (
  event_id   uuid primary key references public.events (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  -- Un bar són cinquanta metres, una finca de casa rural en són tres-cents i
  -- un edifici del campus cent. El topall de dalt no és arbitrari: amb dos
  -- quilòmetres de radi ja no s'està comprovant res.
  radi_m     int not null default 150 check (radi_m between 20 and 2000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table private.event_geo is
  'On és un esdeveniment, per poder-hi fitxar. Al schema private i no a public '
  'per tres raons que s''acumulen: PostgREST no exposa private, o sigui que no '
  'hi ha cap URL que hi arribi; no té cap grant; i public té un invariant que '
  'diu que tota taula ha de tenir alguna política, que aquesta no ha de tenir. '
  'Si fos una columna d''events, el grant de taula que hi ha la faria llegible '
  'per tothom, i el lloc d''un esdeveniment no revelat és un spoiler.';

revoke all on private.event_geo from anon, authenticated;

-- ── la distància, sense cap extensió ────────────────────────────────────────
-- Haversine. La base de producció no té PostGIS ni earthdistance, i demanar
-- una extensió per una fórmula que cap en sis línies seria desproporcionat.
create or replace function private.distance_m(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )))
$$;

comment on function private.distance_m(double precision, double precision, double precision, double precision) is
  'Metres entre dos punts, per haversine. El least(1, …) no és decoració: amb '
  'dos punts idèntics l''aritmètica de coma flotant pot donar 1.0000000000002 '
  'i asin() peta amb un domini fora de rang.';

alter function private.distance_m(double precision, double precision, double precision, double precision) owner to postgres;

-- ── d'on ve un fitxatge ─────────────────────────────────────────────────────
-- Sense això, revocar-ne un és una decisió a cegues. Cap d'aquestes columnes
-- entra al grant de `authenticated`: la migració 34 va substituir el grant de
-- taula d'`attendances` per una llista de columnes, o sigui que tot el que
-- s'hi afegeixi a partir d'ara ja neix invisible per al client. Es llegeixen
-- per `admin_checkins()`, més avall.
alter table public.attendances
  add column if not exists checkin_via text
    check (checkin_via in ('qr', 'ubicacio', 'manual'));

alter table public.attendances
  add column if not exists checkin_lat double precision;
alter table public.attendances
  add column if not exists checkin_lng double precision;
alter table public.attendances
  add column if not exists checkin_precisio_m double precision;
alter table public.attendances
  add column if not exists checkin_dist_m double precision;

comment on column public.attendances.checkin_dist_m is
  'Els metres que va calcular el servidor, no els que va dir el mòbil. És la '
  'columna que fa mirable una llista de fitxatges: qui va fitxar des de quatre '
  'quilòmetres es veu sol.';

-- ── quan es pot fitxar ──────────────────────────────────────────────────────
-- Derivada de l'horari i no administrada: cap interruptor que algú s'hagi de
-- recordar d'obrir la nit de la festa. Les sis hores de després són la mateixa
-- finestra que l'Inici fa servir per no fer desaparèixer del calendari la
-- festa on ets dret (`IN_PROGRESS_MS`).
create or replace function private.checkin_open_at(p_event_id uuid)
returns tsrange
language sql
stable
security definer
set search_path = ''
as $$
  select tsrange(
    (e.starts_at - interval '1 hour') at time zone 'UTC',
    (coalesce(d.ends_at, e.starts_at + interval '6 hours') + interval '1 hour') at time zone 'UTC'
  )
  from public.events e
  left join public.event_details d on d.event_id = e.id
  where e.id = p_event_id
$$;

alter function private.checkin_open_at(uuid) owner to postgres;

-- ── fitxar ──────────────────────────────────────────────────────────────────
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
volatile
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
end $$;

comment on function public.check_in_here(uuid, double precision, double precision, double precision, uuid, timestamptz) is
  'Fitxar des del mòbil del soci, per la seva posició. No és una prova d''haver-hi '
  'estat —la ubicació del navegador es pot falsejar— sinó una declaració amb '
  'rastre: els punts són immediats i la junta els treu amb admin_undo_checkin.';

alter function public.check_in_here(uuid, double precision, double precision, double precision, uuid, timestamptz) owner to postgres;
revoke all on function public.check_in_here(uuid, double precision, double precision, double precision, uuid, timestamptz) from public, anon;
grant execute on function public.check_in_here(uuid, double precision, double precision, double precision, uuid, timestamptz) to authenticated;

-- ── la junta: on és, i qui hi ha fitxat ─────────────────────────────────────
-- Les coordenades amb valor per defecte, i no per comoditat: cridar-la sense
-- elles és com es treu el punt d'un esdeveniment, i el client ha de poder
-- ometre-les sense enviar nulls explícits.
create or replace function public.admin_save_geo(
  p_event_id uuid,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radi_m int default 150
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_lat is null or p_lng is null then
    delete from private.event_geo where event_id = p_event_id;
    return jsonb_build_object('estat', 'esborrat');
  end if;

  insert into private.event_geo (event_id, lat, lng, radi_m, updated_by)
  values (p_event_id, p_lat, p_lng, coalesce(p_radi_m, 150), (select auth.uid()))
  on conflict (event_id) do update
    set lat = excluded.lat,
        lng = excluded.lng,
        radi_m = excluded.radi_m,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return jsonb_build_object('estat', 'desat');
end $$;

alter function public.admin_save_geo(uuid, double precision, double precision, int) owner to postgres;
revoke all on function public.admin_save_geo(uuid, double precision, double precision, int) from public, anon;
grant execute on function public.admin_save_geo(uuid, double precision, double precision, int) to authenticated;

-- Llegir-les de tornada, perquè el formulari pugui ensenyar el mapa on toca.
-- Només junta: aquesta és l'única escletxa per la qual surten, i està tancada
-- amb la mateixa clau que la resta del panell.
create or replace function public.admin_event_geo(p_event_id uuid)
returns table (lat double precision, lng double precision, radi_m int)
language sql
stable
security definer
set search_path = ''
as $$
  select g.lat, g.lng, g.radi_m
  from private.event_geo g
  where g.event_id = p_event_id
    and private.is_admin()
$$;

alter function public.admin_event_geo(uuid) owner to postgres;
revoke all on function public.admin_event_geo(uuid) from public, anon;
grant execute on function public.admin_event_geo(uuid) to authenticated;

-- La llista que fa mirable un fitxatge. Ordenada per distància descendent: el
-- que s'ha de mirar primer és el que és més lluny.
create or replace function public.admin_checkins(p_event_id uuid)
returns table (
  user_id uuid,
  nombre text,
  avatar_url text,
  checked_in_at timestamptz,
  checkin_via text,
  checkin_dist_m double precision,
  checkin_precisio_m double precision,
  was_registered boolean,
  pagado boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, p.nombre, p.avatar_url, a.checked_in_at, a.checkin_via,
         a.checkin_dist_m, a.checkin_precisio_m, a.was_registered, a.pagado
  from public.attendances a
  join public.profiles p on p.id = a.user_id
  where a.event_id = p_event_id
    and a.checked_in_at is not null
    and private.is_admin()
  order by a.checkin_dist_m desc nulls last, a.checked_in_at desc
$$;

comment on function public.admin_checkins(uuid) is
  'Qui ha fitxat, per quina via i a quants metres. Ordenat per distància '
  'perquè el que s''ha de mirar primer és el que és més lluny. Treure''n un és '
  'admin_undo_checkin, que ja existeix des de la migració 23.';

alter function public.admin_checkins(uuid) owner to postgres;
revoke all on function public.admin_checkins(uuid) from public, anon;
grant execute on function public.admin_checkins(uuid) to authenticated;

-- ── la foto d'entrada canvia de mans ────────────────────────────────────────
-- La migració 34 deia que la d'entrada l'escriu la junta, perquè la feia
-- l'escàner tot sol. Ara se la fa el soci, o sigui que aquella política ja no
-- descriu qui fa la foto. Passa a ser com la de sortida.
drop policy if exists "entry photos are written by the junta" on storage.objects;

create policy "entry photos are written by whose face it is"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'entrada'
    and private.door_photo_owner(name) = (select auth.uid())
    and (select private.is_active_member())
  );

-- Qui les LLEGEIX no canvia gens: la junta veu les d'entrada, que és el que fa
-- comprovable una alta manual, i la de sortida només qui hi surt. Les
-- polítiques de SELECT de la 35 es queden tal com són.

-- I poder-la esborrar, com la de sortida. La d'entrada era immutable perquè
-- era un registre que et feien; ara és teva.
create policy "you may delete your own entry photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'entrada'
    and private.door_photo_owner(name) = (select auth.uid())
  );

create or replace function public.set_entry_photo(p_event_id uuid, p_path text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  if p_path is null or p_path = '' then
    raise exception 'cal un cami' using errcode = '22023';
  end if;

  if private.door_photo_owner(p_path) is distinct from v_me
     or (storage.foldername(p_path))[1] <> 'entrada'
     or (storage.foldername(p_path))[2] is distinct from p_event_id::text then
    raise exception 'cami que no et pertoca' using errcode = '42501';
  end if;

  update public.attendances
     set entry_photo_url = p_path
   where user_id = v_me and event_id = p_event_id and estado = 'asistio';

  if not found then
    return jsonb_build_object('estat', 'no_hi_vas_ser');
  end if;

  return jsonb_build_object('estat', 'desada');
end $$;

comment on function public.set_entry_photo(uuid, text) is
  'La teva foto d''arribada, feta per tu. Substitueix la que hi hagués: a '
  'diferència de quan la feia l''escàner, aquesta és la teva cara i te la pots '
  'tornar a fer.';

alter function public.set_entry_photo(uuid, text) owner to postgres;
revoke all on function public.set_entry_photo(uuid, text) from public, anon;
grant execute on function public.set_entry_photo(uuid, text) to authenticated;

-- `admin_set_entry_photo` de la 34 se'n va: no queda cap camí que l'hi porti,
-- i deixar-la seria deixar una funció que permet a la junta escriure una foto
-- que ja no fa.
drop function if exists public.admin_set_entry_photo(uuid, uuid, text);

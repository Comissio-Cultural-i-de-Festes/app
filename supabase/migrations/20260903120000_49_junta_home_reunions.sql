-- La porta del panell, i el que compta com «els que venen».
--
-- La migració 48 va afegir un tipus d'esdeveniment, i dues consultes d'aquesta
-- funció el van heretar sense voler: el bloc de la porta agafa el primer
-- esdeveniment publicat de la finestra de la nit, i el comptador del calendari
-- compta tot el que ve. Totes dues es van escriure quan tot esdeveniment era
-- una festa.
--
-- Una reunió no té cua, ni QR, ni ningú a qui reclamar cinc euros, o sigui que
-- al bloc de la porta no hi diria res —i pitjor: hi desplaçaria la festa de
-- l'endemà, que és el que la junta hi va a mirar. I al comptador surt dues
-- vegades, perquè les reunions ja tenen el seu bloc.
--
-- Res d'això és una qüestió de permisos: la junta les veu totes dues i les ha
-- de veure. És on surten.

CREATE OR REPLACE FUNCTION public.junta_home()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event   public.events%rowtype;
  v_porta   jsonb := null;
  v_pendents int;
  v_esborranys int;
  v_propers int;
  v_socis int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event
  from public.events
  where published
    -- UNA REUNIÓ NO ÉS LA PORTA. Aquest bloc parla d'una cua, d'un QR i de qui
    -- no ha pagat, i una reunió no té cap de les tres coses. Sense això, una
    -- junta convocada per aquesta nit desplaçaria la festa de demà del lloc on
    -- la junta hi va a treballar.
    and tipo <> 'reunio'
    and starts_at between now() - interval '8 hours' and now() + interval '30 hours'
  order by starts_at
  limit 1;

  if found then
    select jsonb_build_object(
      'id', v_event.id,
      'titulo', t.titulo,
      'starts_at', v_event.starts_at,
      'ubicacion', d.ubicacion,
      'plazas', v_event.plazas,
      'de_pagament', v_event.precio_cents > 0,
      -- Said yes and already through the door are the same set the member
      -- screens count, so the number here and the number there agree.
      'diuen_si', count(*) filter (where a.estado in ('si', 'asistio')),
      'fitxats', count(*) filter (where a.checked_in_at is not null),
      -- Waiting and asked are one number on this screen: from here they are
      -- the same job, which is somebody deciding.
      'esperen', count(*) filter (where a.estado in ('espera', 'sollicitat')),
      'no_pagats', count(*) filter (where a.estado in ('si', 'asistio') and not a.pagado)
    )
    into v_porta
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.event_details d on d.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.id = v_event.id
    group by e.id, t.titulo, d.ubicacion;
  end if;

  select count(*) into v_pendents from public.profiles where estat = 'pendent';
  select count(*) into v_esborranys from public.events where not published;
  select count(*) into v_propers
    from public.events
    -- I les reunions tampoc es compten aquí: tenen el seu bloc al panell, i
    -- sortir a tots dos llocs faria que el nombre no quadrés amb cap llista.
    where tipo <> 'reunio' and starts_at >= now() - interval '8 hours';
  select count(*) into v_socis from public.profiles where estat = 'actiu';

  return jsonb_build_object(
    'porta', v_porta,
    'pendents', v_pendents,
    'esborranys', v_esborranys,
    'propers', v_propers,
    'socis', v_socis
  );
end $function$;

CREATE OR REPLACE FUNCTION public.check_in(p_event_id uuid, p_qr_token uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_client_request_id uuid DEFAULT NULL::uuid, p_entry_photo_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor    uuid := (select auth.uid());
  v_event    public.events%rowtype;
  v_profile  public.profiles%rowtype;
  v_att      public.attendances%rowtype;
  v_new_id   uuid;
  v_status   text;
  v_was_reg  boolean;
  v_free     boolean;
  v_points   int := 0;
  v_replay   boolean := false;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if (p_qr_token is null) = (p_user_id is null) then
    raise exception 'cal un qr o un user_id, no tots dos' using errcode = '22023';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or not v_event.published then
    return jsonb_build_object('status', 'event_not_open');
  end if;

  -- LA PORTA NO ES FA SERVIR A UNA REUNIÓ. Aquesta pantalla es tria per URL,
  -- i res del programa no hi porta amb una reunió: no és una situació de
  -- porta, és una crida equivocada, i per això aixeca en comptes de tornar un
  -- estat que l'escàner sabria dibuixar.
  --
  -- Qui hi era, a una reunió, ho diu qui la tanca. És l'única persona que ho
  -- sap, i és on es reparteixen els punts —si se'n reparteixen.
  if v_event.tipo = 'reunio' then
    raise exception 'una reunio no es fitxa a la porta, es tanca'
      using errcode = '22023';
  end if;

  if p_qr_token is not null then
    select p.* into v_profile
    from public.profiles p
    join public.profile_secret s on s.id = p.id
    where s.qr_token = p_qr_token;
  else
    select * into v_profile from public.profiles where id = p_user_id;
  end if;

  if not found then
    return jsonb_build_object('status', 'not_a_member');
  end if;
  if v_profile.estat <> 'actiu' then
    return jsonb_build_object(
      'status', 'member_inactive',
      'user_id', v_profile.id,
      'nombre', v_profile.nombre,
      'estat', v_profile.estat
    );
  end if;

  v_free := v_event.plazas is null and v_event.precio_cents = 0;

  insert into public.attendances (
    user_id, event_id, estado, checked_in_at, checked_in_by, entry_photo_url, was_registered
  )
  values (
    v_profile.id, p_event_id, 'asistio', now(), v_actor, p_entry_photo_url, false
  )
  on conflict (user_id, event_id) do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    -- A row that did not exist. prev_estado stays null, and was_registered
    -- false is what tells the undo to remove the row rather than restore it.
    v_was_reg := false;
    v_status := case when v_free then 'ok_walkin' else 'ok_walkin_review' end;
  else
    select * into v_att
    from public.attendances
    where user_id = v_profile.id and event_id = p_event_id
    for update;

    if v_att.checked_in_at is not null then
      v_was_reg := coalesce(v_att.was_registered, true);

      v_replay := p_client_request_id is not null and exists (
        select 1 from public.points_log pl
        where pl.client_request_id = p_client_request_id
          and pl.user_id = v_profile.id
          and pl.event_id = p_event_id
      );

      if v_replay then
        v_status := case
                      when v_was_reg then 'ok'
                      when v_free then 'ok_walkin'
                      else 'ok_walkin_review'
                    end;
      else
        v_status := 'already_checked_in';
      end if;

      return jsonb_build_object(
        'status', v_status,
        'replayed', v_replay,
        'user_id', v_profile.id,
        'nombre', v_profile.nombre,
        'escola', v_profile.escola,
        'curs', v_profile.curs,
        'pagado', v_att.pagado,
        'was_registered', v_was_reg,
        'points_awarded', 0,
        'checked_in_at', v_att.checked_in_at
      );
    end if;

    v_was_reg := v_att.estado in ('si', 'potser', 'espera');
    v_status := case
                  when v_was_reg then 'ok'
                  when v_free then 'ok_walkin'
                  else 'ok_walkin_review'
                end;

    update public.attendances
       set estado = 'asistio',
           -- The one line this rewrite is for: what it was, before it is gone.
           prev_estado = v_att.estado,
           -- coalesce keeps the FIRST check-in, not the latest
           checked_in_at = coalesce(checked_in_at, now()),
           checked_in_by = coalesce(checked_in_by, v_actor),
           entry_photo_url = coalesce(entry_photo_url, p_entry_photo_url),
           was_registered = v_was_reg
     where user_id = v_profile.id and event_id = p_event_id
    returning id into v_new_id;
  end if;

  insert into public.points_log (
    user_id, event_id, motivo, puntos, granted_by, client_request_id
  )
  values (
    v_profile.id, p_event_id, 'asistencia', v_event.puntos, v_actor, p_client_request_id
  )
  on conflict do nothing
  returning puntos into v_points;

  select * into v_att from public.attendances where id = v_new_id;

  return jsonb_build_object(
    'status', v_status,
    'replayed', false,
    'user_id', v_profile.id,
    'nombre', v_profile.nombre,
    'escola', v_profile.escola,
    'curs', v_profile.curs,
    'pagado', v_att.pagado,
    'was_registered', v_was_reg,
    'points_awarded', coalesce(v_points, 0),
    'checked_in_at', v_att.checked_in_at
  );
end $function$;


-- ── i els punts d'una reunió de junta, en un sol lloc ────────────────────────
-- La regla és curta: una reunió que només fa la junta no reparteix punts, ni
-- toca la ratxa de qui hi va, ni la de qui no hi és convidat. Seria injust per
-- a qui no és de la junta i no hi pot anar.
--
-- `admin_close_meeting` ja ho respecta perquè s'hi va escriure a dins. Però
-- una regla que viu dins d'una funció val només per aquella funció, i aquí ja
-- hi ha hagut una segona porta: `check_in` reparteix `asistencia` i ningú li
-- havia dit que existissin les reunions. La tercera i la quarta encara no
-- estan escrites.
--
-- Per això va aquí i no allà: és una propietat de `points_log`, i qualsevol
-- camí —el d'avui, el de l'any que ve, un `insert` a mà del manteniment— hi
-- topa igual. Un CHECK no pot mirar una altra taula; un disparador sí.
create or replace function private.no_points_from_junta_meetings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.events e
     where e.id = new.event_id and e.abast = 'junta'
  ) then
    raise exception 'una reunio de junta no reparteix punts'
      using errcode = '22023';
  end if;
  return new;
end $$;

comment on function private.no_points_from_junta_meetings() is
  'Cap punt pot venir d''una reunio que nomes fa la junta. La regla es de la '
  'taula i no de cap RPC: val per a tots els camins, inclosos els que encara '
  'no s''han escrit.';

alter function private.no_points_from_junta_meetings() owner to postgres;
revoke all on function private.no_points_from_junta_meetings() from public, anon;

drop trigger if exists points_log_no_junta_meetings on public.points_log;

create trigger points_log_no_junta_meetings
  before insert or update on public.points_log
  for each row
  execute function private.no_points_from_junta_meetings();

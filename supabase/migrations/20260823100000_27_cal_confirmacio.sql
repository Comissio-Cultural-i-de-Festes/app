-- Asking for a place is not having one.
--
-- For a night out, tapping "Hi vaig" is the whole transaction: there is room
-- or there is not, and the app can answer instantly. A casa rural is not that.
-- Somebody decides who comes — beds, cars, who went last time — and until
-- somebody has decided, an app that says "Ets dins. Divendres a les 21:00" is
-- lying to a person who is about to buy a train ticket.
--
-- So a place on those can be requested and not taken. Three states become
-- distinguishable where there used to be one:
--
--   sollicitat  asked, nobody has decided. Occupies no place.
--   si          the junta said yes. Occupies a place.
--   rebutjat    the junta said no.
--
-- `rebutjat` is separate from `no` on purpose. `no` is "I can't come" and it
-- is the member's own sentence; showing it to somebody who was turned down
-- would be the app putting words in their mouth about a decision that was not
-- theirs.

-- ── which events work this way ──────────────────────────────────────────────
-- A column and not `tipo = 'casa_rural'` written into the logic. The rule is
-- "this one needs deciding", and that is a property of the evening, not of a
-- category: a party with a coach to hire needs it too, and a casa rural with
-- beds to spare does not. The form ticks it by default for a casa rural, which
-- is where a default belongs.
alter table public.events
  add column if not exists cal_confirmacio boolean not null default false;

comment on column public.events.cal_confirmacio is
  'Whether a yes is a request rather than a place. Signing up writes '
  '`sollicitat`, which occupies nothing until admin_decide_attendance() turns '
  'it into `si`.';

alter table public.attendances drop constraint attendances_estado_check;

alter table public.attendances add constraint attendances_estado_check
  check (estado in (
    'si', 'potser', 'no', 'espera', 'asistio', 'cancelado', 'sollicitat', 'rebutjat'
  ));

-- Everything the app reads about an event comes through this view — the member
-- screen, the junta's list and the junta's form all select from it — so the
-- flag has to be here or the screens cannot tell the two kinds of event apart.
create or replace view public.events_public
with (security_invoker = true, security_barrier = true) as
select
  e.id,
  e.titulo,
  e.tipo,
  e.starts_at,
  e.teaser,
  e.reveal_at,
  (e.reveal_at is null or e.reveal_at <= now()) as revelat,
  e.plazas,
  e.precio_cents,
  e.puntos,
  e.published,
  e.created_by,
  e.created_at,
  d.descripcion,
  d.ubicacion,
  d.ends_at,
  d.cover_url,
  d.transport_info,
  -- Last, and not next to `published` where it belongs: CREATE OR REPLACE
  -- VIEW can only append columns, and dropping this one would take the
  -- grants and every policy that reads it down with it.
  e.cal_confirmacio
from public.events e
left join public.event_details d on d.event_id = e.id;

alter view public.events_public owner to postgres;

create or replace function private.event_needs_confirming(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(cal_confirmacio, false) from public.events where id = p_event_id
$$;

comment on function private.event_needs_confirming is
  'Whether a yes on this event is a request. SECURITY DEFINER so the policies '
  'below can ask it about an event the caller can only partly read.';

revoke all on function private.event_needs_confirming(uuid) from public, anon;
grant execute on function private.event_needs_confirming(uuid) to authenticated;

-- ── the policies, and the guard that matters ────────────────────────────────
-- `private.event_has_room` counts `('si', 'asistio')` and so already ignores a
-- request — that half needs no change. What does need saying is the other
-- half: a member must not be able to write `si` on an event that needs
-- confirming. Without that line the whole feature is decoration, because the
-- request state would be one PATCH away from the confirmed one.
--
-- It is the same shape as the waiting-list guard from migration 17: the state
-- that is worth having is the state you are not allowed to award yourself.
drop policy att_insert_self on public.attendances;

create policy att_insert_self on public.attendances
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado in ('si', 'potser', 'no', 'espera', 'sollicitat')
    and private.event_is_published(event_id)
    and (
      estado <> 'si'
      or (private.event_has_room(event_id) and not private.event_needs_confirming(event_id))
    )
    and (estado <> 'espera' or not private.event_has_room(event_id))
    and (estado <> 'sollicitat' or private.event_needs_confirming(event_id))
  );

drop policy att_update_self on public.attendances;

create policy att_update_self on public.attendances
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado not in ('asistio', 'cancelado')
  )
  with check (
    user_id = (select auth.uid())
    and estado in ('si', 'potser', 'no', 'espera', 'sollicitat')
    and (
      estado <> 'si'
      or (private.event_has_room(event_id) and not private.event_needs_confirming(event_id))
    )
    and (estado <> 'espera' or not private.event_has_room(event_id))
    and (estado <> 'sollicitat' or private.event_needs_confirming(event_id))
  );

-- `rebutjat` is deliberately absent from both lists. Being turned down is not
-- something anybody says about themselves, and it is not something anybody
-- should be able to take back by hand — leaving it out means a refusal can
-- only be undone by the junta deciding again.

-- ── answering ───────────────────────────────────────────────────────────────
create or replace function public.set_attendance(p_event_id uuid, p_estado text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado  text := p_estado;
  v_full    boolean;
  v_confirm boolean;
begin
  if p_estado not in ('si', 'potser', 'no') then
    raise exception 'resposta invalida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('attendance:' || p_event_id::text));

  v_full    := not private.event_has_room(p_event_id);
  v_confirm := private.event_needs_confirming(p_event_id);

  -- Order matters. On an event that needs deciding a yes is a request whether
  -- or not there is room: the waiting list answers "somebody else has the last
  -- place", and that is not the question here.
  if p_estado = 'si' and v_confirm then
    v_estado := 'sollicitat';
  elsif p_estado = 'si' and v_full then
    v_estado := 'espera';
  end if;

  insert into public.attendances (user_id, event_id, estado)
  values ((select auth.uid()), p_event_id, v_estado)
  on conflict (user_id, event_id) do update
    set estado = excluded.estado;

  return jsonb_build_object(
    'estado', v_estado,
    'ple', v_full,
    'cal_confirmacio', v_confirm,
    'posicio', case when v_estado = 'espera'
                    then public.waitlist_position(p_event_id) end
  );
end $$;

comment on function public.set_attendance is
  'Sets the caller''s answer and says what it actually became. A yes can land '
  'on the waiting list (no room) or as a request (the event needs deciding), '
  'and neither is a mistake, so neither is an error. SECURITY INVOKER: the '
  'policies on attendances do the deciding. Takes a per-event advisory lock so '
  'two simultaneous yeses cannot both find the last place.';

-- ── deciding ────────────────────────────────────────────────────────────────
-- Returns a verdict instead of raising, the same way check_in does. "There is
-- no room left" is not a fault in the request; it is the answer, and the
-- screen has a sentence for it.
create or replace function public.admin_decide_attendance(
  p_event_id uuid,
  p_user_id uuid,
  p_accepta boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_att public.attendances%rowtype;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('attendance:' || p_event_id::text));

  select * into v_att
  from public.attendances
  where event_id = p_event_id and user_id = p_user_id
  for update;

  if not found or v_att.estado <> 'sollicitat' then
    return jsonb_build_object('estat', 'no_demanat');
  end if;

  -- The cap is checked here and nowhere else, because this is the only place a
  -- place is actually taken. Refusing rather than overfilling: raising `plazas`
  -- is a decision with a reason behind it, and it should be made on the form
  -- rather than by a button that quietly stopped counting.
  if p_accepta and not private.event_has_room(p_event_id) then
    return jsonb_build_object('estat', 'sense_places');
  end if;

  update public.attendances
     set estado = case when p_accepta then 'si' else 'rebutjat' end
   where event_id = p_event_id and user_id = p_user_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'decide_attendance',
    v_att.id,
    jsonb_build_object(
      'esdeveniment', p_event_id,
      'soci', p_user_id,
      'accepta', p_accepta
    )
  );

  return jsonb_build_object('estat', case when p_accepta then 'si' else 'rebutjat' end);
end $$;

comment on function public.admin_decide_attendance(uuid, uuid, boolean) is
  'Turns a request into a place or a refusal. Audited: this is the junta '
  'deciding who goes on a trip, which is the decision most likely to be asked '
  'about afterwards.';

alter function public.admin_decide_attendance(uuid, uuid, boolean) owner to postgres;
revoke all on function public.admin_decide_attendance(uuid, uuid, boolean) from public, anon;
grant execute on function public.admin_decide_attendance(uuid, uuid, boolean) to authenticated;

-- ── the form learns the new switch ──────────────────────────────────────────
-- Dropped and recreated rather than replaced: a defaulted parameter added to
-- the end is a new overload, not a new version, and PostgREST answers a call
-- that matches two overloads with PGRST203 rather than picking one.
drop function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text
);

create or replace function public.admin_save_event(
  p_titulo text,
  p_tipo text,
  p_starts_at timestamptz,
  p_id uuid default null,
  p_plazas int default null,
  p_precio_cents int default 0,
  p_puntos int default null,
  p_teaser text default null,
  p_reveal_at timestamptz default null,
  p_published boolean default false,
  p_descripcion text default null,
  p_ubicacion text default null,
  p_ends_at timestamptz default null,
  p_cover_url text default null,
  p_transport_info text default null,
  p_cal_confirmacio boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_puntos  int  := p_puntos;
  v_before  jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_tipo not in ('fiesta', 'casa_rural', 'actividad') then
    raise exception 'tipus invalid' using errcode = '22023';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'cal un titol' using errcode = '22023';
  end if;

  -- Only for a new event. Changing the scale later must never restate what an
  -- evening that already happened was worth.
  if v_puntos is null then
    select punts into v_puntos
      from public.point_values
     where mena = 'tipus_esdeveniment' and clau = p_tipo;
    v_puntos := coalesce(v_puntos, 10);
  end if;

  if v_id is null then
    insert into public.events (
      titulo, tipo, starts_at, plazas, precio_cents, puntos,
      teaser, reveal_at, published, cal_confirmacio, created_by
    )
    values (
      p_titulo, p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, coalesce(p_cal_confirmacio, false),
      (select auth.uid())
    )
    returning id into v_id;
  else
    select to_jsonb(e) into v_before from public.events e where e.id = v_id;
    if v_before is null then
      raise exception 'esdeveniment inexistent' using errcode = '42501';
    end if;

    update public.events set
      titulo = p_titulo, tipo = p_tipo, starts_at = p_starts_at,
      plazas = p_plazas, precio_cents = p_precio_cents, puntos = v_puntos,
      teaser = p_teaser, reveal_at = p_reveal_at, published = p_published,
      cal_confirmacio = coalesce(p_cal_confirmacio, false)
    where id = v_id;
  end if;

  insert into public.event_details (
    event_id, descripcion, ubicacion, ends_at, cover_url, transport_info
  )
  values (v_id, p_descripcion, p_ubicacion, p_ends_at, p_cover_url, p_transport_info)
  on conflict (event_id) do update set
    descripcion    = excluded.descripcion,
    ubicacion      = excluded.ubicacion,
    ends_at        = excluded.ends_at,
    cover_url      = excluded.cover_url,
    transport_info = excluded.transport_info;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    case when p_id is null then 'create_event' else 'edit_event' end,
    v_id,
    jsonb_build_object(
      'titulo', p_titulo, 'published', p_published, 'reveal_at', p_reveal_at,
      'cal_confirmacio', coalesce(p_cal_confirmacio, false)
    )
  );

  return v_id;
end $$;

comment on function public.admin_save_event is
  'Creates or updates an event and its detail row in one transaction. Two '
  'round trips could leave an event whose details row never arrived, and an '
  'absent details row is indistinguishable from a reveal that has not '
  'happened — so the screen would look correct and the location would be gone.';

alter function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean
) owner to postgres;
revoke all on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean
) from public, anon;
grant execute on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean
) to authenticated;

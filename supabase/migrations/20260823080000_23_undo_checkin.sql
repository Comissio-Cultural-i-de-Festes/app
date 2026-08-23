-- Undoing the last check-in.
--
-- Tapping the wrong person with a queue behind you happens, and until now
-- there was no way back from it — not from the app, not from the dashboard,
-- not by hand. The person kept an attendance they never had and the points
-- that came with it, and the only advice the app could give was to take the
-- points off from their profile, which leaves the attendance behind.
--
-- Three things stood in the way, and this migration removes them in order.

-- ── 1. The prior state was destroyed and never written down ─────────────────
-- check_in overwrites `estado` with 'asistio' and records only `was_registered`,
-- a boolean that collapses 'si', 'potser' and 'espera' into one value and
-- collapses a walk-in with no row at all, a 'no' and a 'cancelado' into the
-- other. Restoring from it is a guess, and the guess is wrong in the case that
-- matters most: putting somebody from the waiting list back as 'si' jumps them
-- the queue and eats a place.
alter table public.attendances add column if not exists prev_estado text;

comment on column public.attendances.prev_estado is
  'What `estado` was immediately before the check-in, so admin_undo_checkin() '
  'can put it back exactly. Null both before a check-in and for a walk-in '
  'whose row did not exist, which is why the undo distinguishes the two by '
  'was_registered rather than by this being null.';

-- ── 2. The immutability trigger caught everybody, definer RPCs included ─────
-- `attendances_checkin_immutable` refuses to move `checked_in_at`, and unlike
-- `profiles_guard` it had no exception for a caller that is not the
-- `authenticated` role — so a SECURITY DEFINER function was blocked exactly
-- like a PATCH straight through PostgREST.
--
-- That was right when nothing was allowed to move it. Now exactly one thing
-- is: an admin-only, audited RPC. The escape is the same one `profiles_guard`
-- has used since the first migration, and it is narrow — inside a definer
-- function `current_user` is the function's owner, and everywhere else it is
-- `authenticated`.
--
-- And it opens less than it looks. `authenticated` holds an UPDATE grant on
-- `attendances.estado` and on no other column, so `checked_in_at` was never
-- writable from PostgREST by anybody, admin included. This trigger was the
-- second lock on a door the column grants already held shut, and it stays
-- exactly that for every caller that is not a definer function.
--
-- The alternative was to delete the row and insert a fresh one, which is what
-- the comment in 050_checkin.test.sql suggested. It would have cost `pagado`,
-- `created_at` — and with it the person's place in the waiting-list order,
-- which `waitlist_position()` takes from it — and the row's `id`, which is
-- what the `set_paid` entries in audit_log point at.
create or replace function private.attendances_checkin_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if old.checked_in_at is not null and new.checked_in_at is distinct from old.checked_in_at then
    raise exception 'checked_in_at no es pot moure' using errcode = '42501';
  end if;

  return new;
end $$;

comment on function private.attendances_checkin_immutable() is
  'A check-in time is written once. SECURITY INVOKER on purpose: inside a '
  'definer RPC current_user is the owner, which is how admin_undo_checkin() '
  'gets through and nothing else does. A definer version of this trigger '
  'would see the owner on every call and wave everything through.';

-- ── 3. check_in starts recording what it overwrote ──────────────────────────
create or replace function public.check_in(
  p_event_id uuid,
  p_qr_token uuid default null,
  p_user_id uuid default null,
  p_client_request_id uuid default null,
  p_entry_photo_url text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
end $$;

alter function public.check_in(uuid, uuid, uuid, uuid, text) owner to postgres;
revoke all on function public.check_in(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.check_in(uuid, uuid, uuid, uuid, text) to authenticated;

-- ── the undo itself ─────────────────────────────────────────────────────────
create or replace function public.admin_undo_checkin(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_att public.attendances%rowtype;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_att
  from public.attendances
  where user_id = p_user_id and event_id = p_event_id
  for update;

  if not found or v_att.checked_in_at is null then
    raise exception 'aquesta persona no esta fitxada' using errcode = 'P0002';
  end if;

  -- Only the attendance points. A "montaje" or a "conduir" awarded the same
  -- evening is a separate decision by a person, and undoing a scan is not a
  -- reason to reverse it.
  --
  -- It has to be a delete, not a compensating negative row: points_log has a
  -- partial unique index on (user_id, event_id) where motivo = 'asistencia',
  -- so the compensating row would collide with the row it compensates. And
  -- leaving anything behind that carries the original client_request_id would
  -- be worse than useless — check_in's `on conflict do nothing` has no target,
  -- so a re-scan would silently swallow the conflict and hand back a green
  -- verdict with zero points.
  delete from public.points_log
   where user_id = p_user_id and event_id = p_event_id and motivo = 'asistencia';

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'undo_checkin',
    v_att.id,
    jsonb_build_object(
      'esdeveniment', p_event_id,
      'soci', p_user_id,
      'era', coalesce(v_att.prev_estado, 'cap fila'),
      'fitxat_a', v_att.checked_in_at
    )
  );

  -- A walk-in had no row before the scan, so putting it back means removing
  -- it. Anybody else keeps their row, and with it pagado, created_at — their
  -- place in the waiting-list order — and the id the payment trail points at.
  if coalesce(v_att.was_registered, false) = false and v_att.prev_estado is null then
    delete from public.attendances where id = v_att.id;
    return;
  end if;

  update public.attendances
     set estado = coalesce(v_att.prev_estado, 'si'),
         prev_estado = null,
         checked_in_at = null,
         checked_in_by = null,
         was_registered = null,
         entry_photo_url = null
   where id = v_att.id;
end $$;

comment on function public.admin_undo_checkin(uuid, uuid) is
  'Takes back a scan. Restores the exact estado check_in overwrote, or removes '
  'the row if the person was a walk-in who had none, and deletes the '
  'attendance points so a re-scan awards them again cleanly. Audited: this is '
  'the junta editing who was where.';

alter function public.admin_undo_checkin(uuid, uuid) owner to postgres;
revoke all on function public.admin_undo_checkin(uuid, uuid) from public, anon;
grant execute on function public.admin_undo_checkin(uuid, uuid) to authenticated;

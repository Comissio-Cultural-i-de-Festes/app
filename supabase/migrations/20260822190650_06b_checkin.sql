-- The check-in path.
--
-- Split out of 06_functions.sql because it is the one piece of this schema
-- that runs in public, at a door, with a queue behind it.

-- ── check-in ────────────────────────────────────────────────────────────────
--
-- The whole operation in one function because it has to be one transaction. An
-- Edge Function chaining supabase.from(...) calls is several transactions: if
-- it dies between marking the attendance and writing the points, the person is
-- through the door with nothing to show for it.
--
-- Idempotent in two independent ways, and both are needed:
--   * the partial unique index on points_log (user_id, event_id) where
--     motivo = 'asistencia' collapses two admin phones scanning the same
--     person at the same moment;
--   * the unique client_request_id collapses one phone resending its offline
--     queue, and lets a replay be told apart from a genuine second scan so the
--     scanner shows the original verdict instead of a false amber.
--
-- checked_in_at comes from the server. The clock on a phone being passed
-- around at a party is not evidence, and that timestamp ends up deciding who
-- was at an event.
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
    select * into v_profile from public.profiles where qr_token = p_qr_token;
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

  -- A walk-in at a free, unlimited event is simply in. At an event with places
  -- or a price it is still a yes — turning someone away at the door is worse
  -- than a row to reconcile on Monday, and if the QR path refused people the
  -- manual path admits, the junta would stop scanning — but the junta has to
  -- see that this person was neither signed up nor paid.
  v_free := v_event.plazas is null and v_event.precio_cents = 0;

  -- One atomic statement decides who created the row, so two admins scanning
  -- at once cannot both think they were first.
  insert into public.attendances (
    user_id, event_id, estado, checked_in_at, checked_in_by, entry_photo_url, was_registered
  )
  values (
    v_profile.id, p_event_id, 'asistio', now(), v_actor, p_entry_photo_url, false
  )
  on conflict (user_id, event_id) do nothing
  returning id into v_new_id;

  if v_new_id is not null then
    v_was_reg := false;
    v_status := case when v_free then 'ok_walkin' else 'ok_walkin_review' end;
  else
    -- The row already existed. Lock it before deciding anything.
    select * into v_att
    from public.attendances
    where user_id = v_profile.id and event_id = p_event_id
    for update;

    if v_att.checked_in_at is not null then
      v_was_reg := coalesce(v_att.was_registered, true);

      -- Same request id as the row that granted the points? Then this is the
      -- offline queue resending, not a second person at the door, and the
      -- scanner should see what it saw the first time.
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
           -- coalesce keeps the FIRST check-in, not the latest
           checked_in_at = coalesce(checked_in_at, now()),
           checked_in_by = coalesce(checked_in_by, v_actor),
           entry_photo_url = coalesce(entry_photo_url, p_entry_photo_url),
           was_registered = v_was_reg
     where user_id = v_profile.id and event_id = p_event_id
    returning id into v_new_id;
  end if;

  -- Zero rows back means the points were already granted, which is how a
  -- resend is told from a first scan in a single round trip, with no
  -- select-then-insert race in between.
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

revoke all on function public.check_in(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.check_in(uuid, uuid, uuid, uuid, text) to authenticated;

-- The scanner downloads this when it opens, and caches it in IndexedDB.
--
-- Without it the three-colour contract is a lie for the whole event: with no
-- signal the scanner cannot tell a valid QR from a garbage one, so everything
-- reads green at the door and the violet "not one of ours" only appears hours
-- later at sync, when the person is long gone.
--
-- Hashes, not tokens. A junta phone left on a table must not hand over 300
-- forgeable check-in credentials; sha256 of a v4 uuid is 122 bits of nothing
-- to brute force. The client hashes what it scans and looks up the digest.
--
-- Every active member, not just the ones signed up, so a walk-in resolves
-- instantly and manual-add-by-name works with no connection at all.
create or replace function public.checkin_roster(p_event_id uuid)
returns table (
  token_sha256 text,
  user_id uuid,
  nombre text,
  escola text,
  curs int,
  estado text,
  pagado boolean,
  checked_in boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select encode(sha256(p.qr_token::text::bytea), 'hex'),
         p.id,
         p.nombre,
         p.escola,
         p.curs,
         a.estado,
         coalesce(a.pagado, false),
         a.checked_in_at is not null
  from public.profiles p
  left join public.attendances a
         on a.user_id = p.id and a.event_id = p_event_id
  where private.is_admin()
    and p.estat = 'actiu'
$$;

revoke all on function public.checkin_roster(uuid) from public, anon;
grant execute on function public.checkin_roster(uuid) to authenticated;

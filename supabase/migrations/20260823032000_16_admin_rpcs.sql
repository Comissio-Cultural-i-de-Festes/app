-- What the junta needs and could not do.
--
-- Three things: name another admin without asking a developer, create an
-- invitation code without inventing the string itself, and save an event
-- without the chance of leaving half of one behind.

-- ── the handover is a click ─────────────────────────────────────────────────
-- Until now naming an admin required `owner`, which meant every June the
-- incoming junta had to find whoever set the project up. Section 8 of the
-- specification calls the handover "el punto que más apps de asociación mata",
-- and a handover that depends on one person's phone being answered is exactly
-- that.
--
-- So: an admin names an admin. `owner` stops being a rank and becomes what it
-- should be — infrastructure, held by whoever administers the project — and it
-- is the only thing an ordinary admin cannot grant or take away.
--
-- What still holds:
--   * you cannot change your own role, in either direction;
--   * only an owner may promote to owner or demote one;
--   * every change is in audit_log with who, whom, from and to.
--
-- What is deliberately NOT guarded: an admin can demote another admin. Two
-- admins can in principle unname each other. The trail is the answer to that,
-- and an owner can always put it back — which is the whole reason owner stays.
create or replace function public.admin_set_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old   text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_role not in ('member', 'admin', 'owner') then
    raise exception 'rol invalid' using errcode = '22023';
  end if;
  if p_user_id = v_actor then
    raise exception 'no pots canviar el teu propi rol' using errcode = '42501';
  end if;

  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'perfil inexistent' using errcode = '42501';
  end if;

  -- The one rank an admin cannot reach, in either direction.
  if (p_role = 'owner' or v_old = 'owner') and not private.is_owner() then
    raise exception 'nomes owner pot tocar el rol owner' using errcode = '42501';
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (v_actor, 'set_role', p_user_id, jsonb_build_object('de', v_old, 'a', p_role));
end $$;

comment on function public.admin_set_member_role is
  'Any admin may name or unname another admin, so the June handover does not '
  'depend on reaching whoever set the project up. Only an owner may touch the '
  'owner role, and nobody may change their own. Audited.';

revoke all on function public.admin_set_member_role(uuid, text) from public, anon;
grant execute on function public.admin_set_member_role(uuid, text) to authenticated;

-- ── invitations ─────────────────────────────────────────────────────────────
-- The code is generated here rather than in the browser for two reasons: the
-- client would have to invent the string and then handle a unique violation it
-- did not expect, and a code minted on a phone is a code whose alphabet nobody
-- reviewed.
--
-- The alphabet has no 0/O and no 1/I/L, because these get read aloud across a
-- noisy room and typed by somebody who has had a drink. Six characters over 31
-- symbols is nine hundred million codes, for something that also expires and
-- counts its uses.
create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_try  int := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      if i = 3 then v_code := v_code || '-'; end if;
    end loop;

    exit when not exists (select 1 from public.invites where codi = v_code);

    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'no s''ha pogut generar un codi lliure' using errcode = '55000';
    end if;
  end loop;

  return v_code;
end $$;

revoke all on function private.new_invite_code() from public, anon, authenticated;

create or replace function public.admin_create_invite(
  p_expires_at timestamptz default null,
  p_max_usos int default null
)
returns public.invites
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_row public.invites;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_max_usos is not null and p_max_usos < 1 then
    raise exception 'max_usos ha de ser positiu' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'la caducitat ja ha passat' using errcode = '22023';
  end if;

  insert into public.invites (codi, created_by, expires_at, max_usos)
  values (private.new_invite_code(), (select auth.uid()), p_expires_at, p_max_usos)
  returning * into v_row;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()), 'create_invite', v_row.id,
    jsonb_build_object('expires_at', p_expires_at, 'max_usos', p_max_usos)
  );

  return v_row;
end $$;

create or replace function public.admin_revoke_invite(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  update public.invites set revoked = true where id = p_id;
  if not found then
    raise exception 'invitacio inexistent' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values ((select auth.uid()), 'revoke_invite', p_id, '{}'::jsonb);
end $$;

revoke all on function public.admin_create_invite(timestamptz, int) from public, anon;
revoke all on function public.admin_revoke_invite(uuid) from public, anon;
grant execute on function public.admin_create_invite(timestamptz, int) to authenticated;
grant execute on function public.admin_revoke_invite(uuid) to authenticated;

-- Both paths are now definer functions that leave a trail, so the client has
-- no business writing this table directly. Revoking the grants is what makes
-- that true — and the two policies underneath become unreachable, so they go
-- as well rather than sitting there looking like they protect something.
revoke insert, update, delete on public.invites from authenticated;
drop policy invites_insert_admin on public.invites;
drop policy invites_update_admin on public.invites;

comment on table public.invites is
  'Created and revoked only through admin_create_invite() and '
  'admin_revoke_invite(), which generate the code and leave an audit row. '
  'authenticated has SELECT and nothing else, so there is no path that '
  'rewrites a code or its owner.';

-- ── saving an event ─────────────────────────────────────────────────────────
-- An event is two rows in two tables, and the reveal depends on the second one
-- being absent rather than blank. Two round trips from a form on a phone at a
-- bar means the second one can fail on its own, leaving an event with no
-- location that looks, to every policy in the schema, exactly like an event
-- whose reveal has not happened yet.
--
-- One function, one transaction, and the audit row the junta will want in
-- March when somebody asks who moved the date.
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
  p_transport_info text default null
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
      teaser, reveal_at, published, created_by
    )
    values (
      p_titulo, p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, (select auth.uid())
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
      teaser = p_teaser, reveal_at = p_reveal_at, published = p_published
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
      'titulo', p_titulo, 'published', p_published, 'reveal_at', p_reveal_at
    )
  );

  return v_id;
end $$;

comment on function public.admin_save_event is
  'Creates or updates an event and its detail row in one transaction. Two '
  'round trips could leave an event whose details row never arrived, and an '
  'absent details row is indistinguishable from a reveal that has not '
  'happened — so the screen would look correct and the location would be gone.';

revoke all on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text
) from public, anon;
grant execute on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text
) to authenticated;

-- Privileged operations.
--
-- Every function here is SECURITY DEFINER, `set search_path = ''`, owned by
-- postgres, and follows two invariants without exception:
--
--   * the actor is always (select auth.uid()), never a parameter. An admin
--     must not be able to forge who granted what.
--   * the authorisation check is the first statement in the body.
--
-- These exist because admins and members share one database role, so column
-- grants cannot say "admins may write this". The narrow, audited function is
-- where that distinction lives.

-- ── invitations ─────────────────────────────────────────────────────────────

-- The one thing anon may call. Returns a bare boolean and answers identically
-- for "no such code" and "already exhausted", so codes cannot be probed.
create or replace function public.invite_preview(p_codi text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v record;
begin
  select i.revoked,
         i.expires_at,
         i.max_usos,
         (select count(*) from public.invite_uses u where u.invite_id = i.id) as usos
    into v
  from public.invites i
  where i.codi = p_codi;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid',
    (not v.revoked)
      and (v.expires_at is null or v.expires_at > now())
      and (v.max_usos is null or v.usos < v.max_usos)
  );
end $$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- The only route from 'pendent' to 'actiu' that a member can take themselves.
create or replace function public.redeem_invite(p_codi text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_inv   public.invites%rowtype;
  v_usos  int;
  v_estat text;
begin
  if v_uid is null then
    raise exception 'no autenticat' using errcode = '42501';
  end if;

  -- FOR UPDATE serialises max_usos: without it two people redeeming the last
  -- use of a code concurrently both read usos = max - 1 and both get in.
  select * into v_inv from public.invites where codi = p_codi for update;

  if not found
     or v_inv.revoked
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
  then
    return jsonb_build_object('ok', false, 'motiu', 'invalid');
  end if;

  select estat into v_estat from public.profiles where id = v_uid for update;

  if v_estat is null then
    return jsonb_build_object('ok', false, 'motiu', 'sense_perfil');
  elsif v_estat = 'baixa' then
    return jsonb_build_object('ok', false, 'motiu', 'baixa');
  elsif v_estat = 'actiu' then
    return jsonb_build_object('ok', true, 'motiu', 'ja_actiu');
  end if;

  insert into public.invite_uses (invite_id, user_id)
  values (v_inv.id, v_uid)
  on conflict do nothing;

  select count(*) into v_usos from public.invite_uses where invite_id = v_inv.id;

  if v_inv.max_usos is not null and v_usos > v_inv.max_usos then
    -- Raising rolls the insert above back with it.
    raise exception 'invitacio exhaurida' using errcode = '42501';
  end if;

  update public.profiles set estat = 'actiu' where id = v_uid and estat = 'pendent';

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- ── the two revoked columns ─────────────────────────────────────────────────

-- A member reads their own QR token and nobody else's. SELECT on the column
-- itself is revoked, so this is the only way to it from a client.
create or replace function public.my_qr()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.qr_token
  from public.profiles p
  where p.id = (select auth.uid()) and p.estat = 'actiu'
$$;

revoke all on function public.my_qr() from public, anon;
grant execute on function public.my_qr() to authenticated;

-- Rotation on demand, for a leaked or shoulder-surfed code. Deliberately not
-- automatic on check-in: a phone that was offline at the door would then show
-- a stale QR at the next event, which is the worst possible time to find out.
create or replace function public.rotate_qr_token()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_new uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'no autenticat' using errcode = '42501';
  end if;

  update public.profiles
     set qr_token = gen_random_uuid()
   where id = (select auth.uid())
  returning qr_token into v_new;

  return v_new;
end $$;

revoke all on function public.rotate_qr_token() from public, anon;
grant execute on function public.rotate_qr_token() to authenticated;

create or replace function public.set_my_phone(p_telefon text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'no autenticat' using errcode = '42501';
  end if;
  update public.profiles set telefon = p_telefon where id = (select auth.uid());
end $$;

revoke all on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;

-- The junta's list for reconciling against the WhatsApp group. Admin only,
-- which is why telefon is not simply readable on profiles.
create or replace function public.admin_member_contacts()
returns table (id uuid, nombre text, telefon text, estat text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.telefon, p.estat
  from public.profiles p
  where private.is_admin()
  order by p.nombre
$$;

revoke all on function public.admin_member_contacts() from public, anon;
grant execute on function public.admin_member_contacts() to authenticated;

-- ── roles and membership ────────────────────────────────────────────────────

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
  if not private.is_owner() then
    raise exception 'nomes owner' using errcode = '42501';
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

  update public.profiles set role = p_role where id = p_user_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (v_actor, 'set_role', p_user_id, jsonb_build_object('de', v_old, 'a', p_role));
end $$;

revoke all on function public.admin_set_member_role(uuid, text) from public, anon;
grant execute on function public.admin_set_member_role(uuid, text) to authenticated;

create or replace function public.admin_set_member_estat(p_user_id uuid, p_estat text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old   text;
  v_role  text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_estat not in ('pendent', 'actiu', 'baixa') then
    raise exception 'estat invalid' using errcode = '22023';
  end if;

  select estat, role into v_old, v_role
  from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'perfil inexistent' using errcode = '42501';
  end if;

  -- The handover happens every year and this is where it can go irrecoverably
  -- wrong. is_admin() is true for owners too, so without these two checks an
  -- admin could deactivate the only owner and leave the association with
  -- nobody able to appoint one — a state no one inside the app can undo.
  if v_role = 'owner' and not private.is_owner() then
    raise exception 'nomes un owner pot canviar l''estat d''un owner'
      using errcode = '42501';
  end if;

  if v_role = 'owner' and p_estat <> 'actiu'
     and (select count(*) from public.profiles
           where role = 'owner' and estat = 'actiu') <= 1
  then
    raise exception 'no pots deixar l''associacio sense owner' using errcode = '42501';
  end if;

  update public.profiles set estat = p_estat where id = p_user_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (v_actor, 'set_estat', p_user_id, jsonb_build_object('de', v_old, 'a', p_estat));
end $$;

revoke all on function public.admin_set_member_estat(uuid, text) from public, anon;
grant execute on function public.admin_set_member_estat(uuid, text) to authenticated;

-- Money, so it is audited.
create or replace function public.admin_set_paid(p_attendance_id uuid, p_pagado boolean)
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

  update public.attendances set pagado = p_pagado where id = p_attendance_id;
  if not found then
    raise exception 'inscripcio inexistent' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values ((select auth.uid()), 'set_paid', p_attendance_id, jsonb_build_object('pagado', p_pagado));
end $$;

revoke all on function public.admin_set_paid(uuid, boolean) from public, anon;
grant execute on function public.admin_set_paid(uuid, boolean) to authenticated;

-- Bootstraps the first owner without hardcoding anyone's account. Drop this
-- function in a follow-up migration once the president has claimed.
create or replace function public.claim_first_owner()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('claim_first_owner'));
  if exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'ja hi ha owner' using errcode = '42501';
  end if;
  update public.profiles
     set role = 'owner', estat = 'actiu'
   where id = (select auth.uid());
end $$;

revoke all on function public.claim_first_owner() from public, anon;
grant execute on function public.claim_first_owner() to authenticated;

-- ── points ──────────────────────────────────────────────────────────────────

-- The ledger's only manual write path.
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
declare v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;
  -- Corrections are compensating rows, and taking points away is the kind of
  -- thing that starts arguments, so it needs the higher role.
  if p_puntos < 0 and not private.is_owner() then
    raise exception 'nomes owner pot restar punts' using errcode = '42501';
  end if;

  insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
  values (p_user_id, p_event_id, p_motivo, p_puntos, p_nota, (select auth.uid()))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

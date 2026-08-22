-- Triggers.

-- ── new user ────────────────────────────────────────────────────────────────
-- Profiles are created here, which is why `profiles` has no INSERT policy and
-- no INSERT privilege.
--
-- `raw_user_meta_data` is entirely client-controlled at signup: anyone can
-- send {"role":"owner"}. Reading role or estat out of it would be instant
-- total compromise, so both are literals below and must stay that way.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, avatar_url, estat, role)
  values (
    new.id,
    -- nombre is NOT NULL and a phone or OAuth signup can arrive with no email,
    -- so this chain has to be total. A constraint violation here surfaces as
    -- Supabase's opaque "Database error saving new user" and blocks signup
    -- outright. Do not "fix" that by wrapping the body in an exception
    -- handler: swallowing it leaves an auth user with no profile, locked out
    -- permanently and invisible.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Membre'
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    'pendent', -- HARDCODED. Never from metadata.
    'member'   -- HARDCODED. Never from metadata.
  )
  on conflict (id) do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── protected profile columns ───────────────────────────────────────────────
-- A backstop behind the column grants in 03_grants.sql. The grants are the
-- enforcement; this also constrains the RPC layer, which grants cannot.
--
-- SECURITY INVOKER, deliberately, and this is the whole trick.
--
-- The guard distinguishes a direct PostgREST request from a call made inside
-- one of the definer RPCs, and it does that by reading current_user. Inside a
-- SECURITY DEFINER function current_user is the function's owner, so a definer
-- version of this trigger would see 'postgres' on every single call and wave
-- everything through — enabled, firing, and completely inert. An invoker
-- trigger sees 'authenticated' for a direct request and 'postgres' when the
-- UPDATE came from inside redeem_invite() or admin_set_member_role(), which is
-- exactly the line we want to draw.
--
-- It needs no privileges of its own: it reads OLD and NEW and raises.
create or replace function private.profiles_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.estat is distinct from old.estat
     or new.qr_token is distinct from old.qr_token
     or new.created_at is distinct from old.created_at
  then
    raise exception 'camps protegits: role, estat i qr_token nomes per rpc'
      using errcode = '42501';
  end if;

  return new;
end $$;

create trigger profiles_guard_protected
  before update on public.profiles
  for each row execute function private.profiles_guard();

-- ── points_log is append-only ───────────────────────────────────────────────
-- Blocks UPDATE even for the table owner, so a definer RPC cannot quietly
-- rewrite history either. Corrections are compensating negative rows.
--
-- DELETE is deliberately NOT blocked. points_log.user_id cascades from
-- profiles, so blocking it would make deleting an auth user fail with a
-- baffling error from three tables away. Keeping history through a deletion is
-- what the soft-delete work in section 11 is for, and it is a separate change.
create or replace function private.points_log_no_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'points_log es append-only' using errcode = '42501';
end $$;

create trigger points_log_no_update
  before update on public.points_log
  for each row execute function private.points_log_no_update();

-- ── check-in time is written once ───────────────────────────────────────────
create or replace function private.attendances_checkin_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.checked_in_at is not null and new.checked_in_at is distinct from old.checked_in_at then
    raise exception 'checked_in_at no es pot moure' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger attendances_checkin_immutable
  before update on public.attendances
  for each row execute function private.attendances_checkin_immutable();

-- ── proposal vote tally ─────────────────────────────────────────────────────
-- Individual votes stay private; the count is public. Maintained here rather
-- than by a second definer view, and `vots` is not in the UPDATE column grant,
-- so nobody can inflate their own idea up the list.
create or replace function private.proposal_votes_tally()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.proposals set vots = vots + 1 where id = new.proposal_id;
    return new;
  else
    update public.proposals set vots = greatest(vots - 1, 0) where id = old.proposal_id;
    return old;
  end if;
end $$;

create trigger proposal_votes_tally
  after insert or delete on public.proposal_votes
  for each row execute function private.proposal_votes_tally();

-- ── scheduled content defaults to hidden, not public ────────────────────────
-- The policy requires `visible_from is not null`, so an unset block stays
-- hidden. This fills in a sensible default so the junta is not forced to think
-- about it, without changing which way the failure falls.
create or replace function private.event_content_default_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visible_from is null then
    select coalesce(e.reveal_at, e.starts_at) into new.visible_from
    from public.events e where e.id = new.event_id;
  end if;
  return new;
end $$;

create trigger event_content_default_visibility
  before insert on public.event_content
  for each row execute function private.event_content_default_visibility();

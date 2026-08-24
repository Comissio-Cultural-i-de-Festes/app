-- The two halves of the diptych, and who may see them.
--
-- WHAT THIS CHANGES ABOUT MIGRATION 14. That migration gave `door-photos` to
-- the junta and to nobody else, and said why in as many words: "Not even the
-- person photographed, for now: there is no screen that shows them their own,
-- and inventing a read path before there is a screen and a privacy notice
-- would be the wrong order." The screen exists now, and the order was right.
-- So the "for now" ends here, and it ends the narrow way: a member may read
-- the two photographs that are of them, and nothing else in the bucket. The
-- junta still sees them all, which is what makes reconciling a Monday-morning
-- walk-in possible at all.
--
-- Migration 14 is left exactly as it was rather than edited, because it is a
-- true record of what was applied on the day it was applied. Its comment
-- describes a policy this file drops; read the two in order.
--
-- THE PATH IS THE PERMISSION. Objects go to
--
--     {entrada|sortida}/{esdeveniment}/{uid}/{quan}.{jpg|webp}
--
-- so `storage.foldername(name)` is `{entrada, esdeveniment, uid}` and a policy
-- can decide who may touch an object without consulting any table. The uid is
-- a folder and not the filename on purpose: with a timestamp as the filename,
-- somebody retaking their exit photograph writes a new object rather than
-- overwriting one, and no UPDATE policy has to exist anywhere.
--
-- THE TWO HALVES ARE NOT SYMMETRICAL, and that is the point:
--
--   entrada/…  the junta writes  ·  the junta and that member read
--   sortida/…  that member writes ·  the junta and that member read
--
-- Nobody may overwrite either. The entry photograph is a record of a moment at
-- a door and must not be swappable; the exit one is the member's own face and
-- they may take another, which under this layout means another object, not a
-- replaced one.

-- ── who owns an object, by its path ─────────────────────────────────────────
-- `language sql` with a regex guard rather than plpgsql with an exception
-- block: this is called once per row inside a SELECT policy, and an exception
-- handler costs a subtransaction every time. A `case` with no `else` gives the
-- null that a malformed path deserves, and a policy that gets null refuses.
create or replace function private.door_photo_owner(p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when array_length(storage.foldername(p_name), 1) = 3
     and (storage.foldername(p_name))[1] in ('entrada', 'sortida')
     and (storage.foldername(p_name))[3] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(p_name))[3])::uuid
  end
$$;

comment on function private.door_photo_owner(text) is
  'The member a door photo is of, read out of its path, or null if the path is '
  'not {entrada|sortida}/{esdeveniment}/{uid}/…. Never raises: it runs inside '
  'storage policies, where an exception is a 500 rather than a refusal.';

alter function private.door_photo_owner(text) owner to postgres;
revoke all on function private.door_photo_owner(text) from public, anon;
grant execute on function private.door_photo_owner(text) to authenticated;

-- ── the policies, replaced ──────────────────────────────────────────────────
drop policy if exists "door photos are the junta's" on storage.objects;
drop policy if exists "door photos are written by the junta" on storage.objects;

create policy "door photos are yours or the junta's"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'door-photos'
    and (
      (select private.is_admin())
      or private.door_photo_owner(name) = (select auth.uid())
    )
  );

-- The entry photograph is taken by whoever is holding the scanner.
create policy "entry photos are written by the junta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'entrada'
    and (select private.is_admin())
  );

-- The exit photograph is taken by the person in it, and only into their own
-- folder. An active member and not a pending one: somebody still waiting for
-- approval has not been at a door.
create policy "exit photos are written by whose face it is"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'sortida'
    and private.door_photo_owner(name) = (select auth.uid())
    and (select private.is_active_member())
  );

-- The delete policy from migration 14 stays as it is: the junta, because
-- somebody will ask for theirs to be removed and the answer has to be yes.

-- ── attaching the entry photograph ──────────────────────────────────────────
-- Why this is not a parameter of `check_in`. It already takes one — but the
-- door cannot wait for an upload before saying "endavant": that is thirty
-- seconds in a basement with a queue behind you. So the scan lands first and
-- the photograph follows it, which needs somewhere to send it afterwards.
-- `check_in` cannot be that place: called a second time with the same
-- `client_request_id` it takes the replay branch and returns without touching
-- the row, which is exactly the behaviour that makes the offline queue safe.
create or replace function public.admin_set_entry_photo(
  p_event_id uuid,
  p_user_id uuid,
  p_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_path is null or p_path = '' then
    raise exception 'cal un cami' using errcode = '22023';
  end if;

  select entry_photo_url into v_before
  from public.attendances
  where user_id = p_user_id and event_id = p_event_id and checked_in_at is not null
  for update;

  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- The first photograph wins, the same rule `check_in` uses. A second scan of
  -- the same person must not quietly replace the picture taken when they
  -- actually walked in.
  if v_before is not null then
    return jsonb_build_object('estat', 'ja_en_te');
  end if;

  update public.attendances
     set entry_photo_url = p_path
   where user_id = p_user_id and event_id = p_event_id;

  return jsonb_build_object('estat', 'desada');
end $$;

comment on function public.admin_set_entry_photo(uuid, uuid, text) is
  'Attaches the door photograph to a check-in that has already happened. Junta '
  'only, and only ever the first one: a second scan of the same person must '
  'not replace the picture from when they walked in.';

alter function public.admin_set_entry_photo(uuid, uuid, text) owner to postgres;
revoke all on function public.admin_set_entry_photo(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_entry_photo(uuid, uuid, text) to authenticated;

-- ── and the one you take yourself ───────────────────────────────────────────
-- Two independent walls make this an RPC rather than a column grant.
-- `authenticated` has UPDATE on `attendances (estado)` and nothing else, and
-- `att_update_self` refuses rows with `estado = 'asistio'` — which is the only
-- state in which an exit photograph means anything.
create or replace function public.set_exit_photo(p_event_id uuid, p_path text)
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

  -- The path has to be in your own folder for this event. The storage policy
  -- says the same thing about the object; this says it about the pointer, so a
  -- member cannot make their row point at somebody else's photograph.
  if private.door_photo_owner(p_path) is distinct from v_me
     or (storage.foldername(p_path))[1] <> 'sortida'
     or (storage.foldername(p_path))[2] is distinct from p_event_id::text then
    raise exception 'cami que no et pertoca' using errcode = '42501';
  end if;

  update public.attendances
     set exit_photo_url = p_path
   where user_id = v_me and event_id = p_event_id and estado = 'asistio';

  if not found then
    -- Not an error worth raising: somebody who did not get in that night has
    -- nothing to photograph the end of, and the screen simply does not offer
    -- it. This is the deep-link case.
    return jsonb_build_object('estat', 'no_hi_vas_ser');
  end if;

  return jsonb_build_object('estat', 'desada');
end $$;

comment on function public.set_exit_photo(uuid, text) is
  'Your own photograph at the end of a night you were checked in to. Replaces '
  'whatever was there, unlike the entry one: this is your face and you may '
  'take another. The path must be in your own folder.';

alter function public.set_exit_photo(uuid, text) owner to postgres;
revoke all on function public.set_exit_photo(uuid, text) from public, anon;
grant execute on function public.set_exit_photo(uuid, text) to authenticated;

-- ── reading your own two ────────────────────────────────────────────────────
-- Migration 03 granted `select` on every column of `attendances`, these two
-- included, which was harmless while nothing ever wrote them. It stops being
-- harmless the moment there are photographs: `att_select_public_si` publishes
-- every `si` and `asistio` row to every active member, so the grant would let
-- any member list the storage path of everybody else's face. The path is not
-- the picture — the bucket is private and the policy above refuses to sign
-- somebody else's object — but there is no reason for it to be readable, so it
-- is not.
--
-- Column-level `revoke select (…)` would do nothing here, which is the trap
-- worth writing down: a table-wide grant already covers every column, and
-- revoking one column against it is a no-op that reads like a fix. The
-- table-wide grant has to go and come back column by column. Every client
-- query on this table already names its columns, so nothing outside these two
-- changes.
revoke select on public.attendances from authenticated;
grant select (
  id, user_id, event_id, estado, prev_estado, created_at,
  pagado, checked_in_at, checked_in_by, was_registered
) on public.attendances to authenticated;

-- Which makes this the only way anybody reads them, and it is `definer`
-- for exactly that reason: the caller no longer has the privilege the body
-- needs. The filter is `auth.uid()` and there is no parameter to widen it.
create or replace function public.my_photos()
returns table (
  event_id uuid,
  titulo text,
  starts_at timestamptz,
  entry_photo_url text,
  exit_photo_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.event_id, e.titulo, e.starts_at, a.entry_photo_url, a.exit_photo_url
  from public.attendances a
  join public.events e on e.id = a.event_id
  where a.user_id = (select auth.uid())
    and a.estado = 'asistio'
    and (a.entry_photo_url is not null or a.exit_photo_url is not null)
  order by e.starts_at desc
$$;

comment on function public.my_photos() is
  'The nights you have a photograph from, newest first. Yours and only yours: '
  'the filter is auth.uid() and there is no argument that could widen it.';

alter function public.my_photos() owner to postgres;
revoke all on function public.my_photos() from public, anon;
grant execute on function public.my_photos() to authenticated;

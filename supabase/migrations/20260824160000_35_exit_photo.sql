-- What the drawings of the diptych ask for that migration 34 does not give.
--
-- Three things, and one of them is a promise that has to be kept in the
-- policies rather than in the copy.
--
-- THE JUNTA DOES NOT SEE THE EXIT PHOTOGRAPH. Migration 34 let them read the
-- whole bucket, which for the entry half is the point — reconciling a
-- Monday-morning walk-in means looking at who came through the door. The exit
-- half has no such use: it is taken by the member, of themselves, hours later
-- and somewhere else. And the camera screen says so in as many words: «aquesta
-- foto no la veu ningú més. Ni la junta, ni el grup, ni el rànquing». A promise
-- printed on the screen that takes the picture cannot be enforced by good
-- intentions, so the SELECT policy is narrowed here: the junta reads
-- `entrada/`, and `sortida/` is read by whose face it is and by nobody else.
--
-- AND THE MEMBER MAY DELETE IT. «Esborra la de sortida», on the diptych. Under
-- 34 only the junta could, which is the wrong way round for the one photograph
-- they cannot even look at.
--
-- WHEN, NOT JUST WHETHER. The diptych puts a time under each half — 23:41 and
-- 04:12 — and says how long the night was. The entry side already has
-- `checked_in_at`; the exit side had nothing, so it gets a column. Reading it
-- off the storage object's `created_at` would work exactly until somebody
-- retook their photograph, at which point the app would claim they left at
-- four in the afternoon.

alter table public.attendances
  add column if not exists exit_photo_at timestamptz;

comment on column public.attendances.exit_photo_at is
  'When the exit photograph was taken, for the time under the right-hand half '
  'of the diptych. Not the storage object''s created_at: retaking the picture '
  'would move it, and the point is the end of that night.';

-- ── who reads what ──────────────────────────────────────────────────────────
drop policy if exists "door photos are yours or the junta's" on storage.objects;

create policy "entry photos are the junta's and yours"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'entrada'
    and (
      (select private.is_admin())
      or private.door_photo_owner(name) = (select auth.uid())
    )
  );

create policy "exit photos are yours alone"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'sortida'
    and private.door_photo_owner(name) = (select auth.uid())
  );

-- The junta's blanket delete from migration 14 stays: somebody will ask for
-- their door photograph to be removed and the answer has to be yes. This adds
-- the case that one is nobody else's business in the first place.
create policy "you may delete your own exit photo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'door-photos'
    and (storage.foldername(name))[1] = 'sortida'
    and private.door_photo_owner(name) = (select auth.uid())
  );

-- ── the time goes in with the photograph ────────────────────────────────────
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

  if private.door_photo_owner(p_path) is distinct from v_me
     or (storage.foldername(p_path))[1] <> 'sortida'
     or (storage.foldername(p_path))[2] is distinct from p_event_id::text then
    raise exception 'cami que no et pertoca' using errcode = '42501';
  end if;

  update public.attendances
     set exit_photo_url = p_path,
         exit_photo_at = now()
   where user_id = v_me and event_id = p_event_id and estado = 'asistio';

  if not found then
    return jsonb_build_object('estat', 'no_hi_vas_ser');
  end if;

  return jsonb_build_object('estat', 'desada');
end $$;

comment on function public.set_exit_photo(uuid, text) is
  'Your own photograph at the end of a night you were checked in to. Replaces '
  'whatever was there, unlike the entry one: this is your face and you may '
  'take another. The path must be in your own folder.';

-- ── and comes out again ─────────────────────────────────────────────────────
-- Only the pointer. The object itself is removed by the client, which is
-- allowed to by the policy above: doing it from here would mean a definer
-- function deleting from storage, and there is no reason for the database to
-- hold that particular knife.
create or replace function public.clear_exit_photo(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_path text;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select exit_photo_url into v_path
  from public.attendances
  where user_id = v_me and event_id = p_event_id
  for update;

  if not found or v_path is null then
    return jsonb_build_object('estat', 'no_en_tens');
  end if;

  update public.attendances
     set exit_photo_url = null,
         exit_photo_at = null
   where user_id = v_me and event_id = p_event_id;

  -- Handed back so the caller knows which object to remove. It is a path the
  -- caller could already read, and one they just stopped pointing at.
  return jsonb_build_object('estat', 'esborrada', 'cami', v_path);
end $$;

comment on function public.clear_exit_photo(uuid) is
  'Forgets your exit photograph. Returns the path so the caller can remove the '
  'object too; the storage policy lets them, and a definer function has no '
  'business deleting files.';

alter function public.clear_exit_photo(uuid) owner to postgres;
revoke all on function public.clear_exit_photo(uuid) from public, anon;
grant execute on function public.clear_exit_photo(uuid) to authenticated;

-- ── the diptych's own query ─────────────────────────────────────────────────
-- Dropped and recreated rather than replaced: the return type gains two
-- columns, and `create or replace function` cannot change a function's result
-- type. Same reason a view can only ever have columns appended.
drop function if exists public.my_photos();

create function public.my_photos()
returns table (
  event_id uuid,
  titulo text,
  starts_at timestamptz,
  entry_photo_url text,
  exit_photo_url text,
  checked_in_at timestamptz,
  exit_photo_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.event_id, e.titulo, e.starts_at, a.entry_photo_url, a.exit_photo_url,
         a.checked_in_at, a.exit_photo_at
  from public.attendances a
  join public.events e on e.id = a.event_id
  where a.user_id = (select auth.uid())
    and a.estado = 'asistio'
  order by e.starts_at desc
$$;

comment on function public.my_photos() is
  'Every night you were checked in to, newest first, photographs or not. The '
  'nights with neither are in it on purpose: the diptych has a screen for '
  'exactly that case, and a member who was there has to be able to reach it.';

alter function public.my_photos() owner to postgres;
revoke all on function public.my_photos() from public, anon;
grant execute on function public.my_photos() to authenticated;

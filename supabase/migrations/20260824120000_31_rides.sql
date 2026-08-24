-- Getting there, when there is no train.
--
-- `rides`, `ride_seats` and their policies have been here since the first
-- migration. Four things were missing, and the first is the one that stopped
-- the feature existing at all: `04_rls.sql` says "No insert policy:
-- public.join_ride() only", and that function was never written. `ride_seats`
-- has no INSERT grant either, so today nobody can get into a car.

-- ── 1. which events have cars ───────────────────────────────────────────────
-- A column and not `tipo = 'casa_rural'` in the logic, for the same reason as
-- `cal_confirmacio`: a party with a coach to hire needs cars and a casa rural
-- fifteen minutes away does not. The form ticks it by default for a casa
-- rural, which is where a default belongs.
alter table public.events
  add column if not exists te_cotxes boolean not null default false;

comment on column public.events.te_cotxes is
  'Whether this event shows the shared-cars block. Ticked by default for a '
  'casa rural by the form, never by the database.';

create or replace function private.event_needs_cars(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(te_cotxes, false) from public.events where id = p_event_id
$$;

revoke all on function private.event_needs_cars(uuid) from public, anon;
grant execute on function private.event_needs_cars(uuid) to authenticated;

-- Offering a car on an event that has none is not something a screen should
-- have to remember not to do.
drop policy rides_insert_driver on public.rides;

create policy rides_insert_driver on public.rides
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select private.is_active_member())
    and private.event_is_revealed(event_id)
    and private.event_needs_cars(event_id)
  );

-- Add the column to the view LAST. `create or replace view` can only append,
-- and dropping this one would take its grants and every policy that reads it.
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
  e.cal_confirmacio,
  e.te_cotxes
from public.events e
left join public.event_details d on d.event_id = e.id;

alter view public.events_public owner to postgres;

-- ── 2. getting in ───────────────────────────────────────────────────────────
-- An advisory lock per car, the same shape as `set_attendance`: two phones
-- tapping the last seat at the same instant both pass a check that is not
-- serialisable on its own, and five people turn up for four seats.
--
-- Returns a verdict rather than raising. None of these is a fault in the
-- request — they are the answer, and each one has its own sentence on screen.
create or replace function public.join_ride(p_ride_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_taken int;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('ride:' || p_ride_id::text));

  select * into v_ride from public.rides where id = p_ride_id;
  if not found or not private.event_is_revealed(v_ride.event_id) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if v_ride.driver_id = (select auth.uid()) then
    return jsonb_build_object('estat', 'ets_el_conductor');
  end if;

  if exists (
    select 1 from public.ride_seats s
    where s.ride_id = p_ride_id and s.user_id = (select auth.uid())
  ) then
    return jsonb_build_object('estat', 'ja_hi_ets');
  end if;

  -- One seat per direction. Two cars for the same journey is one seat that
  -- somebody else could have had, and the driver counting heads on Friday is
  -- the person who pays for it.
  if exists (
    select 1
    from public.ride_seats s
    join public.rides r on r.id = s.ride_id
    where s.user_id = (select auth.uid())
      and r.event_id = v_ride.event_id
      and r.sentit = v_ride.sentit
  ) then
    return jsonb_build_object('estat', 'altre_cotxe');
  end if;

  select count(*) into v_taken from public.ride_seats where ride_id = p_ride_id;
  if v_taken >= v_ride.places then
    return jsonb_build_object('estat', 'sense_places');
  end if;

  insert into public.ride_seats (ride_id, user_id) values (p_ride_id, (select auth.uid()));

  return jsonb_build_object('estat', 'a_dins', 'lliures', v_ride.places - v_taken - 1);
end $$;

comment on function public.join_ride(uuid) is
  'Takes a seat. DEFINER because ride_seats has no insert grant and should not: '
  'the room check and the one-seat-per-direction rule have to happen inside the '
  'same advisory lock as the write, and a policy cannot hold a lock.';

alter function public.join_ride(uuid) owner to postgres;
revoke all on function public.join_ride(uuid) from public, anon;
grant execute on function public.join_ride(uuid) to authenticated;

-- ── 3. a driver cannot shrink a full car ────────────────────────────────────
-- `places` is in the driver's update grant, and it should be — plans change.
-- What must not happen is four people in a car that now says it holds two,
-- because nothing would tell the two who are suddenly not coming.
create or replace function private.rides_places_floor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_taken int;
begin
  select count(*) into v_taken from public.ride_seats where ride_id = new.id;
  if new.places < v_taken then
    raise exception 'ja hi ha % persones al cotxe', v_taken using errcode = '23514';
  end if;
  return new;
end $$;

create trigger rides_places_floor
  before update of places on public.rides
  for each row execute function private.rides_places_floor();

comment on function private.rides_places_floor() is
  'Refuses to set `places` below the number of seats already taken. Somebody '
  'would otherwise stop having a lift without being told.';

-- ── 4. the phone numbers, one direction only ────────────────────────────────
-- A number lives in `profile_contact`, a table of its own whose policies
-- publish it to the person it belongs to and to the junta, and to nobody else.
-- A driver is neither, so this function is the only way they see it, and the
-- rule lives in one place with one job rather than spread across a new policy
-- and a screen.
--
-- The driver sees their own passengers. Passengers see nobody's, including each
-- other's, and this function gives an admin nothing either — they already have
-- `pcontact_select_admin` and the group chat, and widening a lift feature into
-- a directory is not what it is for.
create or replace function public.ride_phones(p_ride_id uuid)
returns table (user_id uuid, nombre text, telefon text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, c.telefon
  from public.ride_seats s
  join public.profiles p on p.id = s.user_id
  left join public.profile_contact c on c.id = s.user_id
  where s.ride_id = p_ride_id
    and private.is_ride_driver(p_ride_id)
  order by s.created_at
$$;

comment on function public.ride_phones(uuid) is
  'The passengers of one car, with their numbers, and only for its driver. '
  'Empty for everybody else. A null number is somebody who never gave one: '
  'the name still comes back, because the driver still needs to know who is in '
  'the car.';

alter function public.ride_phones(uuid) owner to postgres;
revoke all on function public.ride_phones(uuid) from public, anon;
grant execute on function public.ride_phones(uuid) to authenticated;

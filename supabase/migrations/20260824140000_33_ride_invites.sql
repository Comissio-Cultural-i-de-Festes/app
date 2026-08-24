-- Saving a seat for somebody, without putting them in the car.
--
-- A driver who offers four seats usually already knows who two of them are
-- for. Without a way to say so, those two have to be told "get in quick" and
-- the whole thing becomes a race the driver is refereeing by hand.
--
-- But adding somebody to your car IS deciding for them. Somebody would end up
-- on a list saying they are going to Vidrà on Friday because a person they
-- barely know tapped their name — and the first they hear of it is when the
-- driver asks what time to pick them up.
--
-- So a driver holds the seat and the person takes it. `convidat` is a real
-- seat: it counts against the car's capacity from the moment it is offered,
-- because a held seat that anybody could still take is not held. What it is
-- not is a claim that the person is coming.

alter table public.ride_seats
  add column if not exists estat text not null default 'a_dins'
    check (estat in ('convidat', 'a_dins'));

alter table public.ride_seats
  add column if not exists convidat_per uuid references public.profiles (id) on delete set null;

comment on column public.ride_seats.estat is
  '`convidat` is a seat the driver is holding for somebody who has not said '
  'yes yet. It occupies the place — a held seat anybody could take is not held '
  '— and it is not a statement that the person is coming.';

-- ── the driver holds one ────────────────────────────────────────────────────
create or replace function public.invite_to_ride(p_ride_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ride  public.rides%rowtype;
  v_taken int;
begin
  perform pg_advisory_xact_lock(hashtext('ride:' || p_ride_id::text));

  select * into v_ride from public.rides where id = p_ride_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- Only the driver of this car, and only a car that still exists. An admin is
  -- not allowed either: whose car it is is the driver's business.
  if v_ride.driver_id <> (select auth.uid()) then
    raise exception 'nomes el conductor' using errcode = '42501';
  end if;

  if p_user_id = v_ride.driver_id then
    return jsonb_build_object('estat', 'ets_el_conductor');
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and estat = 'actiu'
  ) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if exists (
    select 1 from public.ride_seats s
    where s.ride_id = p_ride_id and s.user_id = p_user_id
  ) then
    return jsonb_build_object('estat', 'ja_hi_ets');
  end if;

  -- Somebody already travelling that way is not free to be held a second seat.
  if exists (
    select 1
    from public.ride_seats s
    join public.rides r on r.id = s.ride_id
    where s.user_id = p_user_id
      and r.event_id = v_ride.event_id
      and r.sentit = v_ride.sentit
  ) then
    return jsonb_build_object('estat', 'altre_cotxe');
  end if;

  select count(*) into v_taken from public.ride_seats where ride_id = p_ride_id;
  if v_taken >= v_ride.places then
    return jsonb_build_object('estat', 'sense_places');
  end if;

  insert into public.ride_seats (ride_id, user_id, estat, convidat_per)
  values (p_ride_id, p_user_id, 'convidat', (select auth.uid()));

  return jsonb_build_object('estat', 'convidat');
end $$;

comment on function public.invite_to_ride(uuid, uuid) is
  'Holds a seat for somebody. Driver only. Writes `convidat`, never `a_dins`: '
  'the person has to say yes themselves, because being driven somewhere is not '
  'a thing anybody else gets to decide for them.';

alter function public.invite_to_ride(uuid, uuid) owner to postgres;
revoke all on function public.invite_to_ride(uuid, uuid) from public, anon;
grant execute on function public.invite_to_ride(uuid, uuid) to authenticated;

-- ── and the person takes it ─────────────────────────────────────────────────
-- The one column a member may write on this table, and only on their own row.
-- `pv`-style column grants rather than a second RPC: accepting is a one-word
-- change to a row that already exists and already belongs to them.
grant update (estat) on public.ride_seats to authenticated;

create policy rseats_accept_self on public.ride_seats
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estat = 'convidat'
  )
  with check (
    user_id = (select auth.uid())
    and estat = 'a_dins'
  );

-- Declining is the delete policy that was already there: `rseats_delete_self`.
-- Nothing new is needed for it, and nothing should be — getting out of a car
-- and turning down a seat in one are the same act.

-- ── joining does not step on a held seat ────────────────────────────────────
-- `join_ride` counted every row, held ones included, so this needs no change.
-- What it did need is a word for the case where the seat waiting for you is
-- one somebody is holding: taking it should accept it rather than be refused.
create or replace function public.join_ride(p_ride_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_seat public.ride_seats%rowtype;
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

  select * into v_seat
  from public.ride_seats
  where ride_id = p_ride_id and user_id = (select auth.uid());

  if found then
    -- A seat being held for you: taking it is accepting it, not a second seat.
    if v_seat.estat = 'convidat' then
      update public.ride_seats set estat = 'a_dins'
       where ride_id = p_ride_id and user_id = (select auth.uid());
      return jsonb_build_object('estat', 'a_dins');
    end if;
    return jsonb_build_object('estat', 'ja_hi_ets');
  end if;

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

-- ── who the driver may hold a seat for ──────────────────────────────────────
-- The active members, by name, so the driver can find their friends. Nothing
-- here that `profiles_select_directory` does not already publish to any member
-- — this exists so the screen does not have to work out who is already in a
-- car for this event.
create or replace function public.ride_candidates(p_ride_id uuid)
returns table (user_id uuid, nombre text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.avatar_url
  from public.profiles p
  where p.estat = 'actiu'
    and private.is_ride_driver(p_ride_id)
    and p.id <> (select auth.uid())
    and not exists (
      select 1
      from public.ride_seats s
      join public.rides r on r.id = s.ride_id
      join public.rides me on me.id = p_ride_id
      where s.user_id = p.id
        and r.event_id = me.event_id
        and r.sentit = me.sentit
    )
  order by p.nombre
$$;

comment on function public.ride_candidates(uuid) is
  'Members a driver could hold a seat for: active, not themselves, and not '
  'already travelling that way. Empty for anybody who is not this car''s '
  'driver.';

alter function public.ride_candidates(uuid) owner to postgres;
revoke all on function public.ride_candidates(uuid) from public, anon;
grant execute on function public.ride_candidates(uuid) to authenticated;

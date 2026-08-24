-- Getting into a car.
--
-- Two assertions carry this file. The last seat cannot go to two people, which
-- is why joining holds an advisory lock rather than checking and then writing.
-- And a driver sees their own passengers' numbers and nobody else sees
-- anybody's — not the passengers between themselves, not the junta.

begin;
select plan(21);

reset role;

create temporary table who as
select
  '00000000-0000-4000-8000-0000000000f1'::uuid as casa,
  '00000000-0000-4000-8000-0000000000f2'::uuid as festa,
  tests.uid('alfa')    as alfa,
  tests.uid('bravo')   as bravo,
  tests.uid('charlie') as charlie,
  tests.uid('delta')   as delta;
grant select on who to authenticated;

-- One event with cars and one without, both revealed.
insert into public.events (id, titulo, tipo, starts_at, puntos, published, te_cotxes) values
  ((select casa from who),  'Casa rural de prova', 'casa_rural', now() + interval '20 days', 30, true, true),
  ((select festa from who), 'Festa al campus',     'fiesta',     now() + interval '21 days', 10, true, false);

insert into public.profile_contact (id, telefon) values
  ((select bravo from who),   '600 00 00 01'),
  ((select charlie from who), '600 00 00 02')
on conflict (id) do update set telefon = excluded.telefon;

-- ── offering ────────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select lives_ok(
  $$ insert into public.rides (event_id, driver_id, sentit, origen, places, hora_sortida)
     values ((select casa from who), (select auth.uid()), 'anada', 'Mataró Nord', 2,
             now() + interval '20 days') $$,
  'a member can offer a car on an event that has them'
);

-- Not something a screen should have to remember not to do.
select throws_ok(
  $$ insert into public.rides (event_id, driver_id, sentit, origen, places)
     values ((select festa from who), (select auth.uid()), 'anada', 'Mataró Nord', 3) $$,
  '42501',
  null,
  'and cannot offer one where the event has no cars'
);

reset role;
create temporary table ids as
select (select id from public.rides where origen = 'Mataró Nord') as cotxe;
grant select on ids to authenticated;

select ok(
  private.event_needs_cars((select casa from who)),
  'the flag is what decides, not the event type'
);

select ok(
  not private.event_needs_cars((select festa from who)),
  'and a party has none unless somebody says so'
);

-- ── getting in ──────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'ets_el_conductor',
  'a driver cannot take a seat in their own car'
);

reset role;
select tests.authenticate_as('bravo');

select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'a_dins',
  'somebody else can'
);

select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'ja_hi_ets',
  'and asking twice says so instead of taking a second seat'
);

reset role;
select is(
  (select count(*)::int from public.ride_seats where ride_id = (select cotxe from ids)),
  1,
  'one seat, not two'
);

-- ride_seats has no insert grant at all: the RPC is the only way in, because
-- the room check has to happen inside the same lock as the write.
select tests.authenticate_as('charlie');
select throws_ok(
  $$ insert into public.ride_seats (ride_id, user_id)
     values ((select cotxe from ids), (select auth.uid())) $$,
  '42501',
  null,
  'and nobody can write a seat directly'
);

select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'a_dins',
  'the second seat goes to the next person'
);

reset role;
select tests.authenticate_as('delta');

select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'sense_places',
  'and the third is told the car is full rather than squeezed in'
);

reset role;
select is(
  (select count(*)::int from public.ride_seats where ride_id = (select cotxe from ids)),
  2,
  'which is the whole point: two seats offered, two seats taken'
);

-- ── one seat per direction ──────────────────────────────────────────────────
reset role;
insert into public.rides (event_id, driver_id, sentit, origen, places)
values ((select casa from who), (select delta from who), 'anada', 'Vilassar', 3);

select tests.authenticate_as('bravo');
select is(
  public.join_ride(
    (select id from public.rides where origen = 'Vilassar')
  )->>'estat',
  'altre_cotxe',
  'somebody already going one way cannot also be in a second car going the same way'
);

-- The other direction is a different journey.
reset role;
insert into public.rides (event_id, driver_id, sentit, origen, places)
values ((select casa from who), (select delta from who), 'tornada', 'Vidrà', 3);

select tests.authenticate_as('bravo');
select is(
  public.join_ride(
    (select id from public.rides where origen = 'Vidrà')
  )->>'estat',
  'a_dins',
  'but coming back is'
);

-- ── the driver cannot shrink a full car ─────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  $$ update public.rides set places = 1 where id = (select cotxe from ids) $$,
  '23514',
  null,
  'a driver cannot set places below the seats already taken'
);

select lives_ok(
  $$ update public.rides set places = 4 where id = (select cotxe from ids) $$,
  'but can make room for more'
);

-- ── the phone numbers ───────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.ride_phones((select cotxe from ids))
    where telefon is not null),
  2,
  'the driver sees the numbers of the people in their car'
);

reset role;
select tests.authenticate_as('bravo');

select is_empty(
  $$ select 1 from public.ride_phones((select cotxe from ids)) $$,
  'a passenger sees nobody''s, not even the people sitting next to them'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is_empty(
  $$ select 1 from public.ride_phones((select cotxe from ids)) $$,
  'and the junta sees nobody''s here either: they have the group chat'
);

-- ── and dropping out ────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('charlie');

select lives_ok(
  $$ delete from public.ride_seats
      where ride_id = (select cotxe from ids) and user_id = (select auth.uid()) $$,
  'anybody can get out of a car they are in'
);

reset role;
select is(
  (select count(*)::int from public.ride_seats where ride_id = (select cotxe from ids)),
  1,
  'and the seat goes back'
);

select * from finish();
rollback;

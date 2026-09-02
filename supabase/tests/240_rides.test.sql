-- Getting into a car.
--
-- Two assertions carry this file. The last seat cannot go to two people, which
-- is why joining holds an advisory lock rather than checking and then writing.
-- And a driver sees their own passengers' numbers and nobody else sees
-- anybody's — not the passengers between themselves, not the junta.

begin;
select plan(30);

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
insert into public.events (id, tipo, starts_at, puntos, published, te_cotxes)
values
  ((select casa from who),'casa_rural',now() + interval '20 days',30,true,true),
  ((select festa from who),'fiesta',now() + interval '21 days',10,true,false);

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ((select casa from who), 'Casa rural de prova'),
  ((select festa from who), 'Festa al campus')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.profile_contact (id, telefon) values
  ((select bravo from who),   '600 00 00 01'),
  ((select charlie from who), '600 00 00 02')
on conflict (id) do update set telefon = excluded.telefon;

-- ── offering ────────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select lives_ok(
  $$ insert into public.rides (event_id, driver_id, sentit, origen, places, hora_sortida)
     values ((select casa from who), (select auth.uid()), 'anada', 'Placa Inventada', 2,
             now() + interval '20 days') $$,
  'a member can offer a car on an event that has them'
);

-- Not something a screen should have to remember not to do.
select throws_ok(
  $$ insert into public.rides (event_id, driver_id, sentit, origen, places)
     values ((select festa from who), (select auth.uid()), 'anada', 'Placa Inventada', 3) $$,
  '42501',
  null,
  'and cannot offer one where the event has no cars'
);

reset role;
create temporary table ids as
select (select id from public.rides where origen = 'Placa Inventada') as cotxe;
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
values ((select casa from who), (select delta from who), 'anada', 'Poble Fals', 3);

select tests.authenticate_as('bravo');
select is(
  public.join_ride(
    (select id from public.rides where origen = 'Poble Fals')
  )->>'estat',
  'altre_cotxe',
  'somebody already going one way cannot also be in a second car going the same way'
);

-- The other direction is a different journey.
reset role;
insert into public.rides (event_id, driver_id, sentit, origen, places)
values ((select casa from who), (select delta from who), 'tornada', 'Casa Falsa', 3);

select tests.authenticate_as('bravo');
select is(
  public.join_ride(
    (select id from public.rides where origen = 'Casa Falsa')
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

-- ── holding a seat for somebody ─────────────────────────────────────────────
-- A driver knowing who two of the seats are for is the ordinary case. Deciding
-- for those people is not, so a held seat is held and nothing more.
reset role;
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.invite_to_ride((select cotxe from ids), (select delta from who)) $$,
  '42501',
  'nomes el conductor',
  'a passenger cannot hold a seat in somebody else''s car'
);

reset role;
select tests.authenticate_as('alfa');

-- Down to exactly one free seat, so the held one below is genuinely the last.
update public.rides set places = 2 where id = (select cotxe from ids);

select is(
  public.invite_to_ride((select cotxe from ids), (select delta from who))->>'estat',
  'convidat',
  'the driver can hold one'
);

reset role;
select is(
  (select estat from public.ride_seats
    where ride_id = (select cotxe from ids) and user_id = (select delta from who)),
  'convidat',
  'and it is held, not taken: nobody has said this person is coming'
);

-- The whole point of holding it. A seat anybody could still take is not held.
select tests.authenticate_as('junta_alfa');
select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'sense_places',
  'a held seat occupies the place, so nobody else can take it'
);

-- Being held a seat is not being in the car: the person says so themselves.
reset role;
select tests.authenticate_as('delta');

select is(
  public.join_ride((select cotxe from ids))->>'estat',
  'a_dins',
  'and taking it is accepting it rather than asking for a second one'
);

reset role;
select is(
  (select count(*)::int from public.ride_seats where ride_id = (select cotxe from ids)),
  2,
  'still two seats: accepting did not add one'
);

-- Turning it down is the same act as getting out of a car, and uses the same
-- policy. Nothing new was needed for it.
reset role;
select tests.authenticate_as('alfa');
select public.invite_to_ride((select cotxe from ids), (select bravo from who));

reset role;
select tests.authenticate_as('bravo');
select lives_ok(
  $$ delete from public.ride_seats
      where ride_id = (select cotxe from ids) and user_id = (select auth.uid()) $$,
  'and turning a held seat down is just getting out of the car'
);

-- Only the person themselves, and only from held to taken.
reset role;
select tests.authenticate_as('alfa');
select public.invite_to_ride((select cotxe from ids), (select bravo from who));

-- The policy's USING filters rather than refusing, so the update touches no
-- rows and raises nothing. Asserting an error here would pass for the wrong
-- reason; what has to be true is that the seat is still only held.
reset role;
select tests.authenticate_as('charlie');
select lives_ok(
  $$ update public.ride_seats set estat = 'a_dins'
      where ride_id = (select cotxe from ids) and user_id = (select bravo from who) $$,
  'accepting on somebody else''s behalf runs without error, because USING filters'
);

reset role;
select is(
  (select estat from public.ride_seats
    where ride_id = (select cotxe from ids) and user_id = (select bravo from who)),
  'convidat',
  'but it changed nothing, which is the half that has to be asserted'
);

select * from finish();
rollback;

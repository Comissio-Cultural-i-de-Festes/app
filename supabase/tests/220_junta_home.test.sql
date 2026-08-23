-- The junta's front door, as one answer.
--
-- The counts are the whole point of this function, so they are what gets
-- pinned. The one worth naming is `esperen`: the waiting list and the people
-- who have asked for a place on a casa rural are two different states and one
-- number here, because from this screen they are the same job — somebody has
-- to decide.

begin;
select plan(13);

reset role;

create temporary table who as
select
  '00000000-0000-4000-8000-0000000000d9'::uuid as avui,
  tests.uid('alfa')     as alfa,
  tests.uid('bravo')    as bravo,
  tests.uid('charlie')  as charlie,
  tests.uid('delta')    as delta,
  tests.uid('echo')     as echo;
grant select on who to authenticated;

-- Everything else out of the window, so the counts below are only about the
-- row this test makes.
update public.events set starts_at = now() + interval '90 days'
 where starts_at between now() - interval '8 hours' and now() + interval '30 hours';

insert into public.events (id, titulo, tipo, starts_at, plazas, precio_cents, puntos, published, cal_confirmacio)
values ((select avui from who), 'Sopar de prova', 'fiesta', now() + interval '3 hours', 10, 1500, 10, true, false);

insert into public.event_details (event_id, ubicacion) values ((select avui from who), 'Nau 3');

insert into public.attendances (user_id, event_id, estado, pagado, checked_in_at) values
  ((select alfa from who),    (select avui from who), 'asistio', true,  now()),
  ((select bravo from who),   (select avui from who), 'si',      true,  null),
  ((select charlie from who), (select avui from who), 'si',      false, null),
  ((select delta from who),   (select avui from who), 'espera',  false, null),
  ((select echo from who),    (select avui from who), 'potser',  false, null);

-- ── who may ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.junta_home() $$,
  '42501',
  'nomes junta',
  'a member cannot read the junta home counts'
);

reset role;
select tests.authenticate_as('junta_alfa');

-- ── the door ────────────────────────────────────────────────────────────────
select is(
  public.junta_home()->'porta'->>'titulo',
  'Sopar de prova',
  'the event starting in three hours is the one at the door'
);

select is(
  public.junta_home()->'porta'->>'ubicacion',
  'Nau 3',
  'with where it is, which is the line under the title'
);

select is(
  (public.junta_home()->'porta'->>'diuen_si')::int,
  3,
  'yes plus already-through-the-door, the same set the member screens count'
);

select is(
  (public.junta_home()->'porta'->>'fitxats')::int,
  1,
  'and how many are actually in'
);

select is(
  (public.junta_home()->'porta'->>'no_pagats')::int,
  1,
  'unpaid counts only the ones who are coming, not the maybes'
);

select is(
  (public.junta_home()->'porta'->>'esperen')::int,
  1,
  'and the waiting list is its own number'
);

-- The two states this screen deliberately adds together: waiting for a place
-- because it is full, and waiting for a decision because somebody has to make
-- one. Different rows in the database, one job for the junta.
reset role;
update public.attendances set estado = 'sollicitat'
 where user_id = (select echo from who) and event_id = (select avui from who);

select tests.authenticate_as('junta_alfa');
select is(
  (public.junta_home()->'porta'->>'esperen')::int,
  2,
  'a request counts with the waiting list, because both mean somebody must decide'
);

-- ── the work ────────────────────────────────────────────────────────────────
select is(
  (public.junta_home()->>'pendents')::int,
  (select count(*)::int from public.profiles where estat = 'pendent'),
  'people waiting to be let into the association'
);

select is(
  (public.junta_home()->>'esborranys')::int,
  (select count(*)::int from public.events where not published),
  'and work done that is not serving anybody yet'
);

-- ── and when there is nothing on ────────────────────────────────────────────
reset role;
update public.events set starts_at = now() + interval '60 days'
 where id = (select avui from who);

select tests.authenticate_as('junta_alfa');

select is(
  public.junta_home()->'porta',
  'null'::jsonb,
  'no event in the window means no door panel, rather than an empty one'
);

select ok(
  (public.junta_home()->>'propers')::int > 0,
  'the calendar count is still there, because there are events, just not tonight'
);

select is(
  (public.junta_home()->>'socis')::int,
  (select count(*)::int from public.profiles where estat = 'actiu'),
  'and how many people are in, which is what the Socis row says out loud'
);

select * from finish();
rollback;

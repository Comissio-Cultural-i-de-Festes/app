-- What somebody waiting for approval can see.
--
-- The door tells them they will see the events and will not be able to answer
-- them. Both halves are load-bearing: the first is the reason the app is worth
-- opening before they are approved, and the second is the gate. A test for one
-- without the other would let either drift.

begin;
select plan(10);

reset role;
select tests.authenticate_as('pendent_alfa');

-- ── the half that opened ────────────────────────────────────────────────────
select ok(
  (select count(*) from public.events) > 0,
  'somebody waiting for approval sees the published events'
);

select is(
  (select count(*)::int from public.events
    where id = '00000000-0000-4000-8000-0000000000e3'),
  0,
  'but not an unpublished one, same as anybody else'
);

select ok(
  (select count(*) from public.events_public where titulo is not null) > 0,
  'and reaches them through the listing view the screens actually read'
);

-- ── everything that did not ─────────────────────────────────────────────────
select is(
  (select count(*)::int from public.event_details),
  0,
  'the location and the description stay shut'
);

select is(
  (select descripcion from public.events_public
    where id = '00000000-0000-4000-8000-0000000000e1'),
  null,
  'so a revealed event still comes back with its details blank'
);

select is(
  (select count(*)::int from public.attendances),
  0,
  'who is coming stays shut, including the public si list'
);

select is(
  (select count(*)::int from public.ranking_periods),
  0,
  'and so do the ranking periods'
);

select throws_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'si') $$,
  '42501',
  null,
  'and they cannot answer, which is the half the door promises'
);

-- ── somebody who left is not somebody waiting ───────────────────────────────
-- 'baixa' is a person who has gone, not a person who has not arrived. Reading
-- the helper as "has a profile" rather than "pendent or actiu" would quietly
-- hand the calendar back to them.
reset role;
select tests.authenticate_as('baixa_alfa');
select is(
  (select count(*)::int from public.events),
  0,
  'somebody who has left sees nothing again'
);

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.events $$,
  '42501',
  null,
  'and anon never gets as far as a policy'
);

select * from finish();
rollback;

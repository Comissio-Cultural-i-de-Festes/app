-- The waiting list.
--
-- The property that matters is not "you can join a queue". It is that nobody
-- can leave one by their own hand: if a member on the list could simply set
-- themselves to 'si', the queue would be decoration and the first person to
-- notice would walk past everybody ahead of them.

begin;
select plan(17);

reset role;
delete from public.attendances;

-- One place, so the second person to answer is the interesting one.
insert into public.events (id, tipo, starts_at, plazas, puntos, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000f9','fiesta',now() + interval '3 days',1,10,true,'00000000-0000-4000-8000-0000000000a1');

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ('00000000-0000-4000-8000-0000000000f9', 'Esdeveniment Golf')
on conflict (event_id) do update set titulo = excluded.titulo;

-- ── room ────────────────────────────────────────────────────────────────────
select ok(
  private.event_has_room('00000000-0000-4000-8000-0000000000f9'),
  'an empty event with one place has room'
);

select ok(
  private.event_has_room('00000000-0000-4000-8000-0000000000e1'),
  'and an event with no cap always does'
);

-- ── the first yes takes the place ───────────────────────────────────────────
select tests.authenticate_as('alfa');

select is(
  (public.set_attendance('00000000-0000-4000-8000-0000000000f9', 'si') ->> 'estado'),
  'si',
  'the first person to answer gets in'
);

reset role;
select ok(
  not private.event_has_room('00000000-0000-4000-8000-0000000000f9'),
  'and the event is now full'
);

-- ── the second yes becomes a place in the queue, and says so ────────────────
-- Not an error. Somebody taps a button drawn ten seconds ago and the last
-- place went while they were reading; refusing that would be correct and
-- useless.
select tests.authenticate_as('bravo');

select is(
  (public.set_attendance('00000000-0000-4000-8000-0000000000f9', 'si') ->> 'estado'),
  'espera',
  'the next yes lands on the waiting list instead'
);

select is(
  (public.set_attendance('00000000-0000-4000-8000-0000000000f9', 'si') ->> 'posicio'),
  '1',
  'and is told where in the queue it landed'
);

select is(
  public.waitlist_position('00000000-0000-4000-8000-0000000000f9'),
  1,
  'first in, first in the queue'
);

-- now() is the transaction timestamp, so every row this test writes carries
-- the same created_at and the order between them would come down to a random
-- uuid. In production each answer is its own transaction and the timestamps
-- differ; here the arrival has to be staged deliberately, or the assertion
-- below would pass or fail by coin toss.
reset role;
update public.attendances set created_at = now() - interval '10 minutes'
 where event_id = '00000000-0000-4000-8000-0000000000f9'
   and user_id = '00000000-0000-4000-8000-000000000002';

select tests.authenticate_as('charlie');
select is(
  (public.set_attendance('00000000-0000-4000-8000-0000000000f9', 'si') ->> 'estado'),
  'espera',
  'so does the one after'
);

select is(
  public.waitlist_position('00000000-0000-4000-8000-0000000000f9'),
  2,
  'behind the person who was already waiting'
);

-- Somebody taps the button again, or reopens the screen and taps it. The
-- upsert must not move them to the back of a queue they were already in.
select is(
  (public.set_attendance('00000000-0000-4000-8000-0000000000f9', 'si') ->> 'posicio'),
  '2',
  'and answering twice does not send you to the back'
);

select is(
  public.waitlist_size('00000000-0000-4000-8000-0000000000f9'),
  2,
  'and the queue knows how long it is'
);

-- ── nobody jumps ────────────────────────────────────────────────────────────
-- The policy, not the function: set_attendance is only one door into this
-- table, and PostgREST offers the other one.
--
-- These are throws_ok and not lives_ok, and the difference is the whole reason
-- the rule lives in the WITH CHECK rather than the USING. A USING clause that
-- excludes a row filters it out: zero rows changed, HTTP 200, and the person
-- is left looking at a screen that did not move. A WITH CHECK that refuses a
-- row raises 42501, so the client knows the answer was no and can say why.
select throws_ok(
  $$ update public.attendances set estado = 'si'
      where event_id = '00000000-0000-4000-8000-0000000000f9'
        and user_id = '00000000-0000-4000-8000-000000000003' $$,
  '42501',
  null,
  'writing si straight past the function is refused, not silently dropped'
);

select is(
  (select estado from public.attendances
    where event_id = '00000000-0000-4000-8000-0000000000f9'
      and user_id = '00000000-0000-4000-8000-000000000003'),
  'espera',
  'and the queue position is intact'
);

-- The mirror of that rule: a list nobody needs is a list that means nothing to
-- the junta, so you cannot queue for an event that has room.
select throws_ok(
  $$ insert into public.attendances (user_id, event_id, estado)
     values ('00000000-0000-4000-8000-000000000003',
             '00000000-0000-4000-8000-0000000000e1', 'espera') $$,
  '42501',
  null,
  'and you cannot queue for an event that has room'
);

select is(
  (select count(*)::int from public.attendances
    where event_id = '00000000-0000-4000-8000-0000000000e1' and estado = 'espera'),
  0,
  'and no such row exists'
);

-- ── the junta decides who comes off the list ────────────────────────────────
-- By hand, and past the cap if they choose to: "you're in, it's tonight" is a
-- message that needs a person behind it.
reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ update public.attendances set estado = 'si'
      where event_id = '00000000-0000-4000-8000-0000000000f9'
        and user_id = '00000000-0000-4000-8000-000000000002' $$,
  'the junta can move somebody off the list'
);

select is(
  (select estado from public.attendances
    where event_id = '00000000-0000-4000-8000-0000000000f9'
      and user_id = '00000000-0000-4000-8000-000000000002'),
  'si',
  'even though the event was already full'
);

select * from finish();
rollback;

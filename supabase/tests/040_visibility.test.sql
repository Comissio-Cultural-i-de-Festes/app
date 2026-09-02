-- Who sees what.
--
-- The reveal is filtered with Postgres now(). Nothing here depends on a device
-- clock, and none of it can be worked around by reading the network tab: the
-- rows are simply not returned.

begin;
select plan(17);

-- Own the starting state. These files run against a database an earlier suite
-- may have written to, and an assertion that quietly stops proving anything is
-- worse than one that fails.
--
-- Delete and re-insert rather than update: attendances_checkin_immutable
-- refuses to move checked_in_at, for everyone including the owner, so a fresh
-- row is the honest way to undo a scan.
reset role;
delete from public.points_log;
delete from public.attendances;
insert into public.attendances (user_id, event_id, estado) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', 'si'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000e1', 'si'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000e1', 'potser'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000e1', 'no'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000e1', 'si'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000e1', 'espera'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000e4', 'si');
insert into public.points_log (user_id, motivo, puntos) values
  ('00000000-0000-4000-8000-000000000001', 'montaje', 20),
  ('00000000-0000-4000-8000-000000000002', 'manual', 45),
  ('00000000-0000-4000-8000-000000000003', 'trajo_gente', 15),
  ('00000000-0000-4000-8000-0000000000b3', 'manual', 999);

select tests.authenticate_as('alfa');

-- ── scheduled content ───────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.event_content),
  1,
  'a member sees only the content block whose visible_from has passed'
);

select is(
  (select titol from public.event_content),
  'Ja visible',
  'and it is the right one'
);

-- ── the reveal ──────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.event_details
    where event_id = '00000000-0000-4000-8000-0000000000e2'),
  0,
  'a member cannot read the details of an event before reveal_at'
);

select is(
  (select count(*)::int from public.event_details
    where event_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'and can once it has passed'
);

-- The row still surfaces, which is the point: a blank space generates no FOMO
-- because nobody knows anything exists. What surfaces is the teaser and the
-- date, and NOT the title.
--
-- Aquesta assercio deia el contrari fins a la migracio 44: esperava
-- 'Esdeveniment Bravo' abans de la revelacio, o sigui que codificava la fuita
-- com a comportament correcte. El titol viu a `event_title` i el filtra la
-- seva propia politica, com la resta.
select row_eq(
  $$ select titulo, teaser, revelat, descripcion is null, ubicacion is null
       from public.events_public
      where id = '00000000-0000-4000-8000-0000000000e2' $$,
  row(null::text, 'Ja ho sabras'::text, false, true, true),
  'before reveal_at the listing shows the teaser and nulls the title and the details'
);

-- I no hi ha cap altra porta: ni la taula base ni la del titol.
select is(
  (select count(*)::int from public.event_title
    where event_id = '00000000-0000-4000-8000-0000000000e2'),
  0,
  'and the title row itself is not there either, so no embed can reach it'
);

select row_eq(
  $$ select revelat, descripcion is null
       from public.events_public
      where id = '00000000-0000-4000-8000-0000000000e1' $$,
  row(true, false),
  'after reveal_at the same listing carries the details'
);

select is(
  (select count(*)::int from public.events
    where id = '00000000-0000-4000-8000-0000000000e3'),
  0,
  'an unpublished event does not exist as far as a member is concerned'
);

-- ── attendance visibility ───────────────────────────────────────────────────
-- The public list is only the yeses. A public list of who said no points at
-- people, and potser is where the junta does its nudging.
select set_eq(
  $$ select distinct estado::text from public.attendances
      where event_id = '00000000-0000-4000-8000-0000000000e1' $$,
  array['si'],
  'a member sees only the si list for an event'
);

select is(
  (select count(*)::int from public.attendances
    where event_id = '00000000-0000-4000-8000-0000000000e1'),
  3,
  'and sees all three of them'
);

-- ── the ranking ─────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.ranking
    where user_id = '00000000-0000-4000-8000-0000000000b3'),
  0,
  'someone who opted out is absent from the ranking'
);

-- The subtle half: filtering after the window function would leave a hole in
-- the sequence, which says both that somebody is hidden and roughly where.
select is_empty(
  $$ with r as (select posicio, row_number() over (order by posicio) as rn from public.ranking)
     select posicio from r where posicio > rn $$,
  'and leaves no gap in the positions to infer them from'
);

select is(
  (select punts from public.ranking where user_id = '00000000-0000-4000-8000-000000000002'),
  45,
  'the ranking still totals the private ledger correctly'
);

select ok(
  (select count(*) from public.ranking) > 0,
  'a plain member can read the ranking at all'
);

reset role;
select tests.authenticate_as('junta_alfa');

-- ── the junta sees everything, so it can prepare it ─────────────────────────
select set_eq(
  $$ select distinct estado::text from public.attendances
      where event_id = '00000000-0000-4000-8000-0000000000e1' $$,
  array['si', 'potser', 'no', 'espera'],
  'the junta sees the maybes and the nos'
);

select is(
  (select count(*)::int from public.event_details
    where event_id = '00000000-0000-4000-8000-0000000000e2'),
  1,
  'and the details of an event that has not been revealed yet'
);

select is(
  (select count(*)::int from public.event_content),
  2,
  'and scheduled content before its time'
);

select * from finish();
rollback;

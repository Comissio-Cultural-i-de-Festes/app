-- Who sees what.
--
-- The reveal is filtered with Postgres now(). Nothing here depends on a device
-- clock, and none of it can be worked around by reading the network tab: the
-- rows are simply not returned.

begin;
select plan(16);

reset role;
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
-- because nobody knows anything exists.
select row_eq(
  $$ select titulo, teaser, revelat, descripcion is null, ubicacion is null
       from public.events_public
      where id = '00000000-0000-4000-8000-0000000000e2' $$,
  row('Esdeveniment Bravo'::text, 'Ja ho sabras'::text, false, true, true),
  'before reveal_at the listing shows the teaser and nulls the details'
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

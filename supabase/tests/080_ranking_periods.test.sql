-- The windowed ranking.
--
-- Everything here is about one question: which term does a point belong to,
-- and who is in the table when the answer is "not this one". The all-time
-- ranking cannot get either wrong, because it has no window, so none of this
-- is covered by 040.

begin;
select plan(15);

-- Its own ledger, from empty. The seed exists to make the screens look like a
-- real association, so it grows whenever a screen needs something to show, and
-- a test that adds its rows on top of it is a test whose expected numbers are
-- somebody else's to change by accident.
reset role;
delete from public.points_log;

-- An event that happened last term, and one that happened this week.
insert into public.events (id, titulo, tipo, starts_at, puntos, published, created_by)
values
  ('00000000-0000-4000-8000-0000000000f1', 'Esdeveniment Eco', 'fiesta',
   now() - interval '100 days', 10, true, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', 'Esdeveniment Fox', 'fiesta',
   now() - interval '2 days', 10, true, '00000000-0000-4000-8000-0000000000a1');

-- THE CASE THE WHOLE DESIGN TURNS ON. Delta helped set up an event a hundred
-- days ago and the junta entered the points today, which is what actually
-- happens: somebody does the paperwork on the Monday, or a fortnight later.
-- Filed by created_at those points would land in this term and quietly inflate
-- a table they have nothing to do with.
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by, created_at)
values ('00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-0000000000f1', 'montaje', 50,
        '00000000-0000-4000-8000-0000000000a1', now());

-- No event to date it by, so the award date is all there is.
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by, created_at)
values ('00000000-0000-4000-8000-000000000005', null, 'manual', 7,
        '00000000-0000-4000-8000-0000000000a1', now() - interval '100 days');

-- Somebody hidden from the individual ranking, who still counts for their
-- school. Politecnica, and the only politecnica points inside this week.
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
values ('00000000-0000-4000-8000-0000000000b3', null, 'manual', 999,
        '00000000-0000-4000-8000-0000000000a1');

-- Charlie is the only member of salut with event points, and went to both of
-- them. Counting per member and then adding up would call that one event.
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by) values
  ('00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-0000000000f1', 'montaje', 5,
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-0000000000f2', 'montaje', 5,
   '00000000-0000-4000-8000-0000000000a1');

select tests.authenticate_as('alfa');

-- ── which term a point lands in ─────────────────────────────────────────────
select is(
  (select punts from public.ranking_period(now() - interval '1 day', now() + interval '1 day')
    where user_id = '00000000-0000-4000-8000-000000000004'),
  0,
  'points entered today for an event last term do not count as this term'
);

select is(
  (select punts from public.ranking_period(now() - interval '101 days', now() - interval '99 days')
    where user_id = '00000000-0000-4000-8000-000000000004'),
  50,
  'they count in the term the event was actually held in'
);

select is(
  (select punts from public.ranking_period(now() - interval '101 days', now() - interval '99 days')
    where user_id = '00000000-0000-4000-8000-000000000005'),
  7,
  'points with no event fall back to when they were awarded'
);

-- ── the boundary ────────────────────────────────────────────────────────────
-- Half-open, so that the end of one term is the start of the next and no
-- evening of points falls into both or neither. The event sits exactly on the
-- line at now() - 100 days.
select is(
  (select punts from public.ranking_period(now() - interval '100 days', now() - interval '99 days')
    where user_id = '00000000-0000-4000-8000-000000000004'),
  50,
  'a point exactly on the opening bound is inside the period'
);

select is(
  (select punts from public.ranking_period(now() - interval '101 days', now() - interval '100 days')
    where user_id = '00000000-0000-4000-8000-000000000004'),
  0,
  'and exactly on the closing bound belongs to the next one, not this one'
);

-- ── who is in the table ─────────────────────────────────────────────────────
-- The trap this replaced: putting the date range in the WHERE instead of the
-- JOIN. Everything would still look right, because the people it silently
-- removes are the ones with nothing yet — which is every single person the
-- per-term ranking exists for.
select is(
  (select count(*)::int from public.ranking_period(now() - interval '1 day', now() + interval '1 day')),
  (select count(*)::int from public.ranking),
  'a period nobody scored in still lists everybody, on zero'
);

select is(
  (select count(*)::int from public.ranking_period(now() - interval '1 day', now() + interval '1 day')
    where user_id = '00000000-0000-4000-8000-0000000000b3'),
  0,
  'somebody who opted out is absent from a windowed ranking too'
);

select is_empty(
  $$ with r as (
       select posicio, row_number() over (order by posicio) as rn
         from public.ranking_period(now() - interval '101 days', now() - interval '99 days')
     )
     select posicio from r where posicio > rn $$,
  'and leaves no gap in the positions there either'
);

-- ── schools ─────────────────────────────────────────────────────────────────
-- Delta is politecnica and their fifty points are the only thing that happened
-- in that window, so the school total is exactly those fifty and none of the
-- seeded points, which were all awarded today.
select is(
  (select punts_totals from public.ranking_escoles_period(
      now() - interval '101 days', now() - interval '99 days')
    where escola = 'politecnica'),
  50,
  'the school ranking counts only what falls inside the window'
);

-- Including the member who is hidden from the individual table: nobody is
-- identifiable inside a sum, and this is where that stays true.
select is(
  (select punts_totals from public.ranking_escoles_period(
      now() - interval '1 day', now() + interval '1 day')
    where escola = 'politecnica'),
  999,
  'and still counts the hidden member toward their school'
);

-- "94 membres · 11 esdeveniments" on the school row. The number has to be
-- distinct events across the school, not events summed per member: one person
-- who came to both counts as two evenings, and two people at the same evening
-- count as one.
select is(
  (select esdeveniments from public.ranking_escoles_period(null, null)
    where escola = 'salut'),
  2,
  'the school event count is distinct events, not a per-member tally'
);

-- ── the periods table ───────────────────────────────────────────────────────
select ok(
  (select count(*) from public.ranking_periods) >= 4,
  'a member can read the periods, which is how the chips get drawn'
);

select throws_ok(
  $$ insert into public.ranking_periods (codi, ordre) values ('t9', 9) $$,
  '42501',
  null,
  'but cannot invent one'
);

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ update public.ranking_periods set ends_at = now() + interval '400 days' where codi = 't3' $$,
  'the junta can move a boundary without a deploy, which is the whole point'
);

reset role;
select tests.authenticate_as_anon();

select throws_ok(
  $$ select * from public.ranking_period(null, null) $$,
  '42501',
  null,
  'anon is stopped by the grant, before the body ever runs'
);

select * from finish();
rollback;

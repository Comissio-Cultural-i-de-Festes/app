-- Saving the ranking calendar.
--
-- The interesting assertions here are the refusals, and one property behind
-- them: a refusal must leave the calendar exactly as it was. Four PATCHes
-- through the table editor could not offer that, and it is the whole reason
-- this RPC exists — a half-written calendar serves a ranking that was never
-- true to everybody who loads the app in the meantime.

begin;
select plan(16);

reset role;
delete from public.audit_log;

-- A calendar that is correct, used as the starting point and as the thing the
-- refusals below must not disturb.
create temporary table bo as
select $${
  "codi": "curs", "mena": "global", "ordre": 0,
  "starts_at": "2030-09-01T00:00:00Z", "ends_at": null
}$$::jsonb as curs,
$${
  "codi": "t1", "mena": "tram", "ordre": 1,
  "starts_at": "2030-09-01T00:00:00Z", "ends_at": "2031-01-01T00:00:00Z"
}$$::jsonb as t1,
$${
  "codi": "t2", "mena": "tram", "ordre": 2,
  "starts_at": "2031-01-01T00:00:00Z", "ends_at": "2031-04-01T00:00:00Z"
}$$::jsonb as t2;
grant select on bo to authenticated;

-- ── who may ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_save_periods(jsonb_build_array((select curs from bo))) $$,
  '42501',
  'nomes junta',
  'a member cannot move the term boundaries'
);

-- The grant is what actually closes the direct path: privileges are checked
-- before RLS, so this is the assertion that matters, not the missing policy.
select throws_ok(
  $$ update public.ranking_periods set ordre = 9 where codi = 't1' $$,
  '42501',
  null,
  'and cannot reach the table directly either, policy or no policy'
);

reset role;
select ok(
  not has_table_privilege('authenticated', 'public.ranking_periods', 'UPDATE'),
  'the write grant is gone, which is what makes the RPC the only way in'
);

select ok(
  has_table_privilege('authenticated', 'public.ranking_periods', 'SELECT'),
  'reading is untouched: everybody needs the chips above the ranking'
);

-- ── a calendar that holds together ──────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_save_periods(
       jsonb_build_array((select curs from bo), (select t1 from bo), (select t2 from bo))) $$,
  'the junta can write the whole calendar'
);

reset role;
select is(
  (select count(*)::int from public.ranking_periods),
  3,
  'and t3 is gone, because a save is the whole calendar and not a patch'
);

select is(
  (select ends_at from public.ranking_periods where codi = 't1'),
  '2031-01-01T00:00:00Z'::timestamptz,
  'the boundaries are what was sent'
);

select is(
  (select mena from public.ranking_periods where codi = 'curs'),
  'global',
  'and the course is still exempt from the chain'
);

select is(
  (select detall->>'quants' from public.audit_log where accio = 'save_periods'),
  '3',
  'moving a boundary leaves a trail, because it restates every score on the home screen'
);

-- ── the shapes that are refused ─────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

-- t2 starts a day after t1 ends. Every point earned that day disappears from
-- both terms and stays in the course total, which is the failure that looks
-- like nothing is wrong.
select throws_ok(
  $$ select public.admin_save_periods(jsonb_build_array(
       (select t1 from bo),
       jsonb_set((select t2 from bo), '{starts_at}', '"2031-01-02T00:00:00Z"'))) $$,
  '22023',
  null,
  'a gap between two terms is refused'
);

-- t2 starts before t1 ends: the same points counted in both.
select throws_ok(
  $$ select public.admin_save_periods(jsonb_build_array(
       (select t1 from bo),
       jsonb_set((select t2 from bo), '{starts_at}', '"2030-12-01T00:00:00Z"'))) $$,
  '22023',
  null,
  'and so is an overlap'
);

select throws_ok(
  $$ select public.admin_save_periods(jsonb_build_array(
       (select t1 from bo),
       jsonb_set((select t2 from bo), '{ordre}', '1'))) $$,
  '22023',
  null,
  'two periods cannot share an ordre: the app opens on the first one'
);

select throws_ok(
  $$ select public.admin_save_periods(jsonb_build_array(
       jsonb_set((select t1 from bo), '{ends_at}', 'null'))) $$,
  '22023',
  null,
  'a term with only one bound is not a link in a chain'
);

select throws_ok(
  $$ select public.admin_save_periods(jsonb_build_array(
       (select t1 from bo), (select t1 from bo))) $$,
  '22023',
  null,
  'the same codi twice is refused instead of the second one winning'
);

select throws_ok(
  $$ select public.admin_save_periods('[]'::jsonb) $$,
  '22023',
  null,
  'and so is emptying the calendar, which would leave the ranking with no chips'
);

-- ── and none of that touched anything ───────────────────────────────────────
reset role;
select results_eq(
  $$ select codi, ordre from public.ranking_periods order by ordre $$,
  $$ values ('curs', 0), ('t1', 1), ('t2', 2) $$,
  'six refusals later the calendar is exactly what it was, which is the point'
);

select * from finish();
rollback;

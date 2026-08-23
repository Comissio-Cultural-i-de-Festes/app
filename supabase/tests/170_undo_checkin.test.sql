-- Taking back a scan.
--
-- The whole sequence, not the pieces: scan, undo, scan again. Each half looks
-- right on its own and the interesting failures only exist in the join —
-- points_log's partial unique index blocks a compensating row, and its unique
-- index on client_request_id turns a leftover into a silent zero-point
-- check-in on the re-scan, because check_in's ON CONFLICT has no target.

begin;
select plan(19);

reset role;
delete from public.audit_log;

-- The personas' ids, read once as the session user: tests.* is revoked from
-- `authenticated`, so a call to tests.uid() after switching persona raises.
create temporary table who as
select tests.uid('alfa') as alfa, tests.uid('golf') as golf;
grant select on who to authenticated;

-- e1 is published, free and uncapped. alfa said yes to it in the seed; golf
-- has no row at all.
select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'si',
  'alfa starts out having said yes'
);

select is_empty(
  $$ select 1 from public.attendances
      where user_id = (select golf from who) and event_id = '00000000-0000-4000-8000-0000000000e1' $$,
  'and golf has no row at all'
);

-- ── who may ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');
select public.check_in('00000000-0000-4000-8000-0000000000e1', null, (select alfa from who));

reset role;
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_undo_checkin(
       '00000000-0000-4000-8000-0000000000e1',
       (select id from public.profiles where nombre = 'Alfa')) $$,
  '42501',
  'nomes junta',
  'a member cannot undo somebody else''s check-in'
);

-- ── somebody who had said yes ───────────────────────────────────────────────
reset role;
select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'asistio',
  'the scan moved alfa to asistio'
);

select is(
  (select prev_estado from public.attendances
    where user_id = (select alfa from who) and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'si',
  'and wrote down what it overwrote, which is the whole point'
);

select isnt_empty(
  $$ select 1 from public.points_log
      where user_id = (select id from public.profiles where nombre = 'Alfa')
        and event_id = '00000000-0000-4000-8000-0000000000e1'
        and motivo = 'asistencia' $$,
  'and gave the attendance points'
);

select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_undo_checkin(
       '00000000-0000-4000-8000-0000000000e1',
       (select id from public.profiles where nombre = 'Alfa')) $$,
  'the junta can take it back'
);

reset role;
select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'si',
  'and alfa is exactly what they were, not a guess'
);

select is(
  (select checked_in_at from public.attendances
    where user_id = (select alfa from who) and event_id = '00000000-0000-4000-8000-0000000000e1'),
  null,
  'with the check-in time cleared, which the trigger used to refuse to anybody'
);

select is_empty(
  $$ select 1 from public.points_log
      where user_id = (select id from public.profiles where nombre = 'Alfa')
        and event_id = '00000000-0000-4000-8000-0000000000e1'
        and motivo = 'asistencia' $$,
  'and the attendance points gone, so the ranking stops counting them'
);

select is(
  (select detall->>'era' from public.audit_log where accio = 'undo_checkin'),
  'si',
  'the trail says what it was, which after this is the only record'
);

-- ── and scanning again works, which is where this used to break ─────────────
select tests.authenticate_as('junta_alfa');
select public.check_in('00000000-0000-4000-8000-0000000000e1', null, (select alfa from who));

reset role;
select is(
  (select count(*)::int from public.points_log
    where user_id = (select alfa from who)
      and event_id = '00000000-0000-4000-8000-0000000000e1'
      and motivo = 'asistencia'),
  1,
  're-scanning awards the points again: one row, not zero and not two'
);

select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'asistio',
  'and they are checked in again'
);

-- ── a walk-in had no row, so the undo removes it ────────────────────────────
select tests.authenticate_as('junta_alfa');
select public.check_in('00000000-0000-4000-8000-0000000000e1', null, (select golf from who));

reset role;
select isnt_empty(
  $$ select 1 from public.attendances
      where user_id = (select id from public.profiles where nombre = 'Golf')
        and event_id = '00000000-0000-4000-8000-0000000000e1' $$,
  'the walk-in got a row'
);

select tests.authenticate_as('junta_alfa');
select lives_ok(
  $$ select public.admin_undo_checkin(
       '00000000-0000-4000-8000-0000000000e1',
       (select id from public.profiles where nombre = 'Golf')) $$,
  'and it can be taken back too'
);

reset role;
select is_empty(
  $$ select 1 from public.attendances
      where user_id = (select id from public.profiles where nombre = 'Golf')
        and event_id = '00000000-0000-4000-8000-0000000000e1' $$,
  'which removes the row, because putting back "no row" is what they had'
);

-- ── undoing something that is not there ─────────────────────────────────────
select tests.authenticate_as('junta_alfa');
select throws_ok(
  $$ select public.admin_undo_checkin(
       '00000000-0000-4000-8000-0000000000e1',
       (select id from public.profiles where nombre = 'Golf')) $$,
  'P0002',
  'aquesta persona no esta fitxada',
  'undoing nothing says so instead of reporting success'
);

-- ── and nobody can still write a check-in time from a client ───────────────
-- The trigger is the second lock, not the only one: `authenticated` holds an
-- UPDATE grant on `estado` and on nothing else, so checked_in_at was never
-- reachable from PostgREST by anybody, admin included. Relaxing the trigger
-- for definer functions did not open a door; this pins the door that was
-- doing the work.
reset role;
select ok(
  not has_column_privilege('authenticated', 'public.attendances', 'checked_in_at', 'UPDATE'),
  'a client cannot write checked_in_at at all, whatever the trigger says'
);

select ok(
  has_column_privilege('authenticated', 'public.attendances', 'estado', 'UPDATE'),
  'and estado is the only column it can write, which is what makes that true'
);

select * from finish();
rollback;

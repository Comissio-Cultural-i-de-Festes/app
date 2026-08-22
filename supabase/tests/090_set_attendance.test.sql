-- Answering an event.
--
-- The rules were already in the policies on attendances and in the column
-- grants; what was missing was a path that could reach them. PostgREST's
-- upsert writes every column of the body, the client may only write `estado`,
-- and the result was 42501 on the one button the home screen has.
--
-- So these assert two separate things: that the function does what a member
-- needs, and that going through it gives up none of the protections.

begin;
select plan(11);

reset role;
delete from public.attendances;

-- e1 is published and revealed. e3 is not published at all.
select tests.authenticate_as('golf');

-- ── what a member needs ─────────────────────────────────────────────────────
select lives_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'si') $$,
  'a member can say yes to a published event'
);

select is(
  (select estado from public.attendances
    where user_id = '00000000-0000-4000-8000-000000000007' and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'si',
  'and the row says so'
);

-- The half the generic upsert could not do at all: coming back and changing
-- your mind, which is the ordinary case and not the exception.
select lives_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'potser') $$,
  'and can change their mind without a second row'
);

select is(
  (select count(*)::int from public.attendances
    where user_id = '00000000-0000-4000-8000-000000000007' and event_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'still exactly one row'
);

select is(
  (select estado from public.attendances
    where user_id = '00000000-0000-4000-8000-000000000007' and event_id = '00000000-0000-4000-8000-0000000000e1'),
  'potser',
  'holding the new answer'
);

-- ── and none of the protections are given up ────────────────────────────────
-- Checking yourself in is the most valuable bypass in the system. The CHECK
-- constraint stops the value existing and the policy stops it being written;
-- either would do, and both are there.
select throws_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'asistio') $$,
  null,
  null,
  'nobody marks themselves as having attended through here'
);

select throws_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e3', 'si') $$,
  '42501',
  null,
  'nor answers an event that is not published, which they cannot even see'
);

-- Once the door has scanned you, the answer is history and not a preference.
reset role;
delete from public.attendances;
insert into public.attendances (user_id, event_id, estado, checked_in_at, checked_in_by)
values ('00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-0000000000e1', 'asistio',
        now(), '00000000-0000-4000-8000-0000000000a1');

select tests.authenticate_as('golf');
select throws_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'no') $$,
  '42501',
  null,
  'and cannot undo a check-in by answering no afterwards'
);

-- SECURITY INVOKER is the whole design here: an accidental definer would make
-- this the one path that ignores every policy above.
select is(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_attendance'),
  false,
  'the function runs as the caller, so the policies still decide'
);

reset role;
select tests.authenticate_as('pendent_alfa');
select throws_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'si') $$,
  '42501',
  null,
  'somebody not admitted yet cannot answer at all'
);

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'si') $$,
  '42501',
  null,
  'and anon is stopped by the grant, before the body runs'
);

select * from finish();
rollback;

-- The check-in.
--
-- This is the part that fails in public if it fails at all, and the offline
-- queue guarantees the replay case will actually happen: the scanner keeps
-- scans in IndexedDB and resends them when the signal comes back, possibly
-- more than once, possibly from two junta phones at the same door.

begin;
select plan(21);

reset role;
select tests.authenticate_as('junta_alfa');

-- ── authorisation ───────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                            '00000000-0000-4000-8000-000000000001', null, null) $$,
  '42501',
  'nomes junta',
  'a member cannot call check_in'
);

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                            '00000000-0000-4000-8000-000000000001', null, null) $$,
  '42501',
  null,
  'anon is stopped by the grant, before the body runs'
);

reset role;
select tests.authenticate_as('junta_alfa');

-- ── a registered member, first scan ─────────────────────────────────────────
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                  '00000000-0000-4000-8000-000000000001',
                  '11111111-1111-4111-8111-111111111111', null) ->> 'status',
  'ok',
  'someone who said si is simply in'
);

select is(
  (select puntos from public.points_log
    where user_id = '00000000-0000-4000-8000-000000000001'
      and event_id = '00000000-0000-4000-8000-0000000000e1'
      and motivo = 'asistencia'),
  10,
  'and gets the event''s points'
);

-- ── replaying the offline queue ─────────────────────────────────────────────
-- The whole reason the client_request_id exists: the same scan arriving twice
-- must show the junta what it showed the first time, not a false amber.
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                  '00000000-0000-4000-8000-000000000001',
                  '11111111-1111-4111-8111-111111111111', null) ->> 'status',
  'ok',
  'resending the same scan returns the original verdict'
);

select is(
  (public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                   '00000000-0000-4000-8000-000000000001',
                   '11111111-1111-4111-8111-111111111111', null) ->> 'replayed')::boolean,
  true,
  'and says so, so the scanner can stay quiet about it'
);

select is(
  (select count(*)::int from public.attendances
    where user_id = '00000000-0000-4000-8000-000000000001'
      and event_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'three sends leave exactly one attendance row'
);

select is(
  (select count(*)::int from public.points_log
    where user_id = '00000000-0000-4000-8000-000000000001'
      and event_id = '00000000-0000-4000-8000-0000000000e1'
      and motivo = 'asistencia'),
  1,
  'and exactly one entry in the ledger'
);

select is(
  (public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                   '00000000-0000-4000-8000-000000000001',
                   '11111111-1111-4111-8111-111111111111', null) ->> 'points_awarded')::int,
  0,
  'a resend awards nothing'
);

-- ── a genuine second scan is not a replay ───────────────────────────────────
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                  '00000000-0000-4000-8000-000000000001',
                  '99999999-9999-4999-8999-999999999999', null) ->> 'status',
  'already_checked_in',
  'a different scan of the same person is flagged, not silently accepted'
);

-- ── first write wins ────────────────────────────────────────────────────────
-- The time this person went through the door, not the time the phone found
-- signal again.
select is(
  (select count(distinct checked_in_at)::int from public.attendances
    where user_id = '00000000-0000-4000-8000-000000000001'
      and event_id = '00000000-0000-4000-8000-0000000000e1'),
  1,
  'checked_in_at never moves once set'
);

-- ── walk-ins ────────────────────────────────────────────────────────────────
-- e1 is free and unlimited, so somebody turning up unannounced is just in.
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                  '00000000-0000-4000-8000-000000000007', null, null) ->> 'status',
  'ok_walkin',
  'a walk-in at a free, unlimited event is green'
);

-- e4 has 30 places and costs money. They still get in — turning someone away
-- at the door is worse than a row to reconcile on Monday, and if the QR path
-- refused people the manual path admits, the junta would stop scanning — but
-- the junta has to see that they were neither signed up nor paid.
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e4', null,
                  '00000000-0000-4000-8000-000000000008', null, null) ->> 'status',
  'ok_walkin_review',
  'a walk-in at an event with places or a price is amber'
);

select is(
  (select was_registered from public.attendances
    where user_id = '00000000-0000-4000-8000-000000000008'
      and event_id = '00000000-0000-4000-8000-0000000000e4'),
  false,
  'and is recorded as a walk-in for the junta to reconcile'
);

select is(
  public.check_in('00000000-0000-4000-8000-0000000000e4', null,
                  '00000000-0000-4000-8000-000000000005', null, null) ->> 'status',
  'ok',
  'while someone who did sign up for the same event is plain ok'
);

-- Replaying a walk-in must not quietly upgrade it to a clean ok.
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e4', null,
                  '00000000-0000-4000-8000-000000000006',
                  '77777777-7777-4777-8777-777777777777', null) ->> 'status',
  'ok_walkin_review',
  'a walk-in scan is amber the first time'
);

select is(
  public.check_in('00000000-0000-4000-8000-0000000000e4', null,
                  '00000000-0000-4000-8000-000000000006',
                  '77777777-7777-4777-8777-777777777777', null) ->> 'status',
  'ok_walkin_review',
  'and still amber when the queue resends it'
);

-- ── the backstop under the two admin phones case ───────────────────────────
-- Two junta members scanning the same person at the same instant both pass the
-- "not checked in yet" test before either commits, and they carry different
-- request ids so the idempotency key does not collapse them. What stops the
-- double award is the partial unique index, enforced by the storage engine
-- rather than by anything in the function. A single session cannot stage that
-- race, so assert the index does its job directly.
reset role;
select throws_ok(
  $$ insert into public.points_log (user_id, event_id, motivo, puntos, client_request_id)
     values ('00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-0000000000e1', 'asistencia', 10,
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
            ('00000000-0000-4000-8000-000000000002',
             '00000000-0000-4000-8000-0000000000e1', 'asistencia', 10,
             'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') $$,
  '23505',
  null,
  'two attendance awards for one person at one event cannot coexist'
);

select tests.authenticate_as('junta_alfa');

-- ── the three things that are not a yes ─────────────────────────────────────
select is(
  public.check_in('00000000-0000-4000-8000-0000000000e1',
                  '99999999-9999-4999-8999-999999999999', null, null, null) ->> 'status',
  'not_a_member',
  'a QR that resolves to nobody'
);

select is(
  public.check_in('00000000-0000-4000-8000-0000000000e1', null,
                  '00000000-0000-4000-8000-0000000000b1', null, null) ->> 'status',
  'member_inactive',
  'an account still waiting for approval'
);

select is(
  public.check_in('00000000-0000-4000-8000-0000000000e3', null,
                  '00000000-0000-4000-8000-000000000001', null, null) ->> 'status',
  'event_not_open',
  'and a scanner pointed at an unpublished event'
);

select * from finish();
rollback;

-- Deleting an event.
--
-- The interesting half is the refusal. points_log.event_id is ON DELETE SET
-- NULL, so a delete does not take the points with it — it leaves them
-- attached to nothing, and the ranking keeps counting them while nobody can
-- say what they were for. This file exists to make sure that stays impossible.

begin;
select plan(11);

reset role;
delete from public.audit_log;

-- e3 is unpublished and nobody has been anywhere near it.
-- e5 is the closing party the seed awards points on.

-- ── who may not ─────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  $$ select public.admin_delete_event('00000000-0000-4000-8000-0000000000e3') $$,
  '42501',
  'nomes junta',
  'a member cannot delete an event'
);

select throws_ok(
  $$ delete from public.events where id = '00000000-0000-4000-8000-0000000000e3' $$,
  '42501',
  null,
  'and cannot go around the function either, because the grant is gone'
);

reset role;
select isnt_empty(
  $$ select 1 from public.events where id = '00000000-0000-4000-8000-0000000000e3' $$,
  'the event is still there'
);

-- ── an event with points is refused ─────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_delete_event('00000000-0000-4000-8000-0000000000e5') $$,
  'P0001',
  null,
  'even the junta cannot delete an event that has points on it'
);

reset role;
select isnt_empty(
  $$ select 1 from public.events where id = '00000000-0000-4000-8000-0000000000e5' $$,
  'and it survives'
);

select is(
  (select count(*)::int from public.audit_log where accio = 'delete_event'),
  0,
  'with nothing written to the trail, because nothing happened'
);

-- ── one that never happened goes ────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_delete_event('00000000-0000-4000-8000-0000000000e3') $$,
  'an event with no points is deleted'
);

reset role;
select is_empty(
  $$ select 1 from public.events where id = '00000000-0000-4000-8000-0000000000e3' $$,
  'and it is really gone'
);

select is_empty(
  $$ select 1 from public.event_details
      where event_id = '00000000-0000-4000-8000-0000000000e3' $$,
  'with its detail row, which cascades'
);

select is(
  (select detall->>'titulo' from public.audit_log where accio = 'delete_event'),
  'Esdeveniment Charlie',
  'and the trail keeps the name, which after this is the only place it exists'
);

-- ── and an event that is not there at all ───────────────────────────────────
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_delete_event('00000000-0000-4000-8000-00000000dead') $$,
  'P0002',
  'esdeveniment inexistent',
  'deleting nothing says so rather than reporting success'
);

select * from finish();
rollback;

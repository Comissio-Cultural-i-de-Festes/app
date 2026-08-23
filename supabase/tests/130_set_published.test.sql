-- Putting an event on, and taking it off, every home screen.
--
-- The junta's most expensive mistake in either direction, so the point of this
-- file is that it cannot happen quietly: only the junta can do it, it always
-- leaves a trail, and the unaudited path through a plain UPDATE is gone.
--
-- The role is reset before every check that reads the table directly. An
-- unpublished event does not exist for a member, so asking as one comes back
-- NULL whatever the truth is — an assertion that would pass for the wrong
-- reason.

begin;
select plan(15);

reset role;
delete from public.audit_log;

-- e3 is the seed's unpublished event.
-- ── who may not ─────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  $$ select public.admin_set_published(
       '00000000-0000-4000-8000-0000000000e3', true) $$,
  '42501',
  'nomes junta',
  'a member cannot publish an event'
);

-- The direct route is closed too, so a member cannot go around the function.
-- The grant is gone, which comes back as a permission error rather than as
-- zero rows — and that distinction is the whole point: an UPDATE filtered away
-- by a policy succeeds having changed nothing, and reads as success.
select throws_ok(
  $$ update public.events set published = true
      where id = '00000000-0000-4000-8000-0000000000e3' $$,
  '42501',
  null,
  'and cannot write the column straight, because the grant no longer exists'
);

reset role;
select is(
  (select published from public.events where id = '00000000-0000-4000-8000-0000000000e3'),
  false,
  'and it stayed unpublished'
);

-- ── the junta ───────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_set_published(
       '00000000-0000-4000-8000-0000000000e3', true) $$,
  'an admin can publish'
);

reset role;
select is(
  (select published from public.events where id = '00000000-0000-4000-8000-0000000000e3'),
  true,
  'and the event is now live'
);

select is(
  (select count(*)::int from public.audit_log where accio = 'set_published'),
  1,
  'with a row in the trail'
);

select is(
  (select detall->>'a' from public.audit_log where accio = 'set_published'),
  'true',
  'that records what it was changed to'
);

select is(
  (select detall->>'de' from public.audit_log where accio = 'set_published'),
  'false',
  'and what it was before, which is the half you want at two in the morning'
);

select is(
  (select actor_id from public.audit_log where accio = 'set_published'),
  tests.uid('junta_alfa'),
  'and who did it'
);

select is(
  (select detall->>'titulo' from public.audit_log where accio = 'set_published'),
  (select titulo from public.events where id = '00000000-0000-4000-8000-0000000000e3'),
  'and which event, by name, so the trail reads without a second query'
);

-- ── and can take it back down ───────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_set_published(
       '00000000-0000-4000-8000-0000000000e3', false) $$,
  'an admin can unpublish, which is the whole reason this exists'
);

reset role;
select is(
  (select published from public.events where id = '00000000-0000-4000-8000-0000000000e3'),
  false,
  'the event is off every home screen again'
);

select is(
  (select count(*)::int from public.audit_log where accio = 'set_published'),
  2,
  'and both directions are in the trail'
);

-- ── a second tap on the same state is not a second decision ────────────────
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_set_published(
       '00000000-0000-4000-8000-0000000000e3', false) $$,
  'setting it to what it already is does not fail'
);

reset role;
select is(
  (select count(*)::int from public.audit_log where accio = 'set_published'),
  2,
  'and does not add a row, so a double tap is not two entries to read through'
);

select * from finish();
rollback;

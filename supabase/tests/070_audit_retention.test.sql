-- The audit trail: who can read it, and how long it lives.

begin;
select plan(9);

reset role;
delete from public.audit_log;

-- Three rows either side of the twenty-four month line, plus one right on the
-- edge, because "older than 24 months" is the whole rule and off-by-a-day is
-- the way retention policies quietly become "forever".
insert into public.audit_log (actor_id, accio, target_id, detall, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'set_role',
   '00000000-0000-4000-8000-000000000001', '{"a":"admin"}'::jsonb, now() - interval '30 months'),
  ('00000000-0000-4000-8000-0000000000a1', 'set_estat',
   '00000000-0000-4000-8000-000000000002', '{"a":"actiu"}'::jsonb, now() - interval '25 months'),
  ('00000000-0000-4000-8000-0000000000a1', 'set_paid',
   '00000000-0000-4000-8000-000000000003', '{"pagado":true}'::jsonb, now() - interval '23 months'),
  ('00000000-0000-4000-8000-0000000000a1', 'set_role',
   '00000000-0000-4000-8000-000000000004', '{"a":"member"}'::jsonb, now() - interval '1 day');

-- ── who can read it ─────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

-- Decided deliberately: a member does not see their own rows in the app. The
-- trail records what the committee did, not what the member did, and showing
-- somebody half of it would mislead more than showing none. It is a UI
-- decision, not a legal one — see the subject access section in the README.
select is(
  (select count(*)::int from public.audit_log),
  0,
  'a member sees no audit rows, not even ones that name them'
);

reset role;
select tests.authenticate_as('junta_alfa');
select is(
  (select count(*)::int from public.audit_log),
  4,
  'the junta sees the trail'
);

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.audit_log $$,
  '42501',
  null,
  'anon cannot read it at all'
);

-- ── nobody can quietly clear it ─────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'),
  'no client can delete audit rows'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE'),
  'nor rewrite them'
);
select ok(
  not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'),
  'nor forge them: entries come from the definer RPCs'
);

-- The point of a trail is that the people in it cannot reach the broom.
select throws_ok(
  $$ select private.purge_audit_log() $$,
  '42501',
  null,
  'and an admin cannot run the purge by hand'
);

-- ── retention ───────────────────────────────────────────────────────────────
reset role;
select is(
  private.purge_audit_log(),
  2,
  'the purge takes exactly the rows past twenty-four months'
);

select results_eq(
  $$ select accio::text from public.audit_log order by created_at $$,
  array['set_paid', 'set_role'],
  'and leaves the ones inside it, including the row at twenty-three months'
);

select * from finish();
rollback;

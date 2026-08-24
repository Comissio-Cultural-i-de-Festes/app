-- Ideas, and the two things that make them safe.
--
-- One: a turned-down idea is nobody's business but its author's. A public list
-- of people's ideas with a "no" beside them is a different and worse thing
-- than a leaderboard, and it is the kind of thing that stops people proposing.
--
-- Two: the points are paid once. Deciding is idempotent because two admins do
-- look at the same list on the same Sunday evening.

begin;
select plan(22);

reset role;
delete from public.audit_log;

create temporary table who as
select
  tests.uid('alfa')  as alfa,
  tests.uid('bravo') as bravo,
  '00000000-0000-4000-8000-0000000000e1'::uuid as event;
grant select on who to authenticated;

-- ── anybody can have an idea ─────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select lives_ok(
  $$ insert into public.proposals (user_id, titol, descripcio)
     values ((select auth.uid()), 'Escapada a Montserrat', 'Un dissabte, amb tren') $$,
  'a member can propose something'
);

-- `estat` is absent from the INSERT column grant, so this is refused by the
-- privilege layer rather than by a policy — which is what stops somebody
-- inserting an already-accepted idea and collecting the points for it.
select throws_ok(
  $$ insert into public.proposals (user_id, titol, estat)
     values ((select auth.uid()), 'Ja acceptada, gracies', 'acceptada') $$,
  '42501',
  null,
  'and cannot hand themselves an accepted one'
);

-- The client picks the key so that resending a queued idea is the same idea.
-- A second attempt collides rather than posting it twice.
select lives_ok(
  $$ insert into public.proposals (id, user_id, titol)
     values ('00000000-0000-4000-8000-00000000d001',
             (select auth.uid()), 'Idea escrita sense cobertura') $$,
  'a member may choose the id, which is what makes a resend idempotent'
);

select throws_ok(
  $$ insert into public.proposals (id, user_id, titol)
     values ('00000000-0000-4000-8000-00000000d001',
             (select auth.uid()), 'Idea escrita sense cobertura') $$,
  '23505',
  null,
  'and sending it twice collides instead of making a second one'
);

reset role;
create temporary table ids as
select
  (select id from public.proposals where titol = 'Escapada a Montserrat') as montserrat;
grant select on ids to authenticated;

-- A second idea, from somebody else, to be turned down later.
insert into public.proposals (user_id, titol)
values ((select bravo from who), 'Quiz al bar del campus');

-- ── voting ───────────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');
select public.set_attendance('00000000-0000-4000-8000-0000000000e1', 'potser');

insert into public.proposal_votes (proposal_id, user_id)
values ((select montserrat from ids), (select auth.uid()));

reset role;
select is(
  (select vots from public.proposals where id = (select montserrat from ids)),
  1,
  'the tally trigger counts a vote without anybody being able to write it'
);

-- Once somebody has backed it, taking it away takes their vote away too.
select tests.authenticate_as('alfa');
select lives_ok(
  $$ delete from public.proposals where titol = 'Escapada a Montserrat' $$,
  'a filtered delete does not raise: the policy filters rather than refusing'
);

reset role;
select isnt_empty(
  $$ select 1 from public.proposals where titol = 'Escapada a Montserrat' $$,
  'and it deleted nothing, because somebody had voted for it'
);

-- ── who may decide ───────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_decide_proposal((select montserrat from ids), true, null,
       (select event from who)) $$,
  '42501',
  'nomes junta',
  'a member cannot decide'
);

-- The admin UPDATE policy is gone, and the column grant never allowed `estat`
-- anyway. Two independent reasons the RPC is the only way in. Asserted while
-- still wearing a persona: as the session user this would bypass both and
-- quietly accept every idea in the table.
select throws_ok(
  $$ update public.proposals set estat = 'acceptada'
      where id = (select montserrat from ids) $$,
  '42501',
  null,
  'and nobody reaches estat directly, policy or no policy'
);

reset role;
select is_empty(
  $$ select 1 from pg_policies
      where tablename = 'proposals' and policyname = 'prop_update_admin' $$,
  'the policy that could never fire is gone rather than left lying around'
);

-- ── the refusals ─────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_decide_proposal((select montserrat from ids), false, null) $$,
  '22023',
  'cal dir per que no',
  'turning something down without a reason is refused'
);

select throws_ok(
  $$ select public.admin_decide_proposal((select montserrat from ids), true, null) $$,
  '22023',
  null,
  'and accepting without an event is refused too'
);

-- ── accepting ────────────────────────────────────────────────────────────────
select is(
  public.admin_decide_proposal(
    (select montserrat from ids), true, 'Ens hi apuntem tots', (select event from who)
  )->>'punts',
  '25',
  'accepting pays whatever the barem says propuso is worth'
);

reset role;
select is(
  (select estat from public.proposals where id = (select montserrat from ids)),
  'acceptada',
  'and the idea is accepted'
);

select is(
  (select count(*)::int from public.points_log
    where user_id = (select alfa from who)
      and event_id = (select event from who)
      and motivo = 'propuso'),
  1,
  'one points row for the person who had the idea'
);

-- ── and deciding it again pays nothing ───────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_decide_proposal(
    (select montserrat from ids), true, 'Un altre admin hi torna', (select event from who)
  )->>'estat',
  'ja_decidida',
  'a second admin gets told it is already decided instead of an error'
);

reset role;
select is(
  (select count(*)::int from public.points_log
    where user_id = (select alfa from who)
      and event_id = (select event from who)
      and motivo = 'propuso'),
  1,
  'and the points are still paid exactly once, which is the point of that branch'
);

-- ── turning one down ─────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_decide_proposal(
    (select id from public.proposals where titol = 'Quiz al bar del campus'),
    false,
    'Aquest trimestre no ens hi cap'
  )->>'estat',
  'descartada',
  'and one can be turned down, with the reason'
);

-- ── a turned-down idea is its author''s business and nobody else''s ──────────
reset role;
select tests.authenticate_as('alfa');

select is_empty(
  $$ select 1 from public.proposals where titol = 'Quiz al bar del campus' $$,
  'another member cannot see a turned-down idea at all'
);

reset role;
select tests.authenticate_as('bravo');

select is(
  (select nota_junta from public.proposals where titol = 'Quiz al bar del campus'),
  'Aquest trimestre no ens hi cap',
  'but its author reads it, and reads why'
);

-- An accepted one stays public: it is why an event exists.
select is(
  (select estat from public.proposals where id = (select montserrat from ids)),
  'acceptada',
  'and an accepted idea is everybody''s business'
);

reset role;
select is(
  (select detall->>'punts' from public.audit_log
    where accio = 'decide_proposal' and (detall->>'accepta')::boolean),
  '25',
  'the trail records what was paid, which is the question asked in March'
);

select * from finish();
rollback;

-- The junta's own powers.
--
-- admin_set_member_role had no test at all before this file, which is how its
-- authorisation rule could be changed without anything going red. Naming an
-- admin is the single most consequential thing anybody can do in this schema —
-- an admin can scan, award points, see phone numbers and approve members — so
-- it gets the coverage that implies.

begin;
select plan(28);

reset role;
delete from public.audit_log;

-- ── naming an admin ─────────────────────────────────────────────────────────
-- The rule changed deliberately: it used to need `owner`, which meant every
-- June the incoming junta had to find whoever set the project up.
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-000000000001', 'admin') $$,
  'an admin can name another admin, so the June handover needs no developer'
);

select is(
  (select role from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'admin',
  'and the role really changed'
);

select lives_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-000000000001', 'member') $$,
  'and can take it away again'
);

select is(
  (select count(*)::int from public.audit_log where accio = 'set_role'),
  2,
  'both changes are in the trail, which is what stands in for the old guard'
);

select throws_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-0000000000a1', 'member') $$,
  '42501',
  null,
  'nobody demotes themselves, in either direction'
);

-- Owner is infrastructure, not a rank in the association. It is the one thing
-- an ordinary admin cannot hand out or take away — otherwise the safety net
-- that restores a junta that has unnamed itself would not exist.
select throws_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-000000000002', 'owner') $$,
  '42501',
  null,
  'an admin cannot promote anybody to owner'
);

select throws_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-0000000000a9', 'member') $$,
  '42501',
  null,
  'nor demote the owner'
);

reset role;
select tests.authenticate_as('cap');
select lives_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-000000000002', 'owner') $$,
  'the owner can, because that is what owner is for'
);

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.admin_set_member_role(
       '00000000-0000-4000-8000-000000000003', 'admin') $$,
  '42501',
  null,
  'an ordinary member cannot name anybody'
);

-- ── invitations ─────────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select matches(
  (select (public.admin_create_invite()).codi),
  '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$',
  'the code is generated in the shape that survives being read aloud'
);

-- No O/0 and no I/1/L: these get shouted across a room and typed by somebody
-- who has had a drink. Only the generated one — the fixtures in the seed
-- predate the generator and are deliberately shaped differently.
select is_empty(
  $$ select codi from public.invites
      where created_at = (select max(created_at) from public.invites)
        and codi ~ '[OI01L]' $$,
  'and contains none of the characters people mishear'
);

select is(
  (select count(distinct codi)::int from public.invites),
  (select count(*)::int from public.invites),
  'every code is different'
);

select is(
  (select created_by from public.invites order by created_at desc limit 1),
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  'and belongs to whoever made it'
);

select throws_ok(
  $$ select public.admin_create_invite(now() - interval '1 day') $$,
  '22023',
  null,
  'a code that has already expired is not a code'
);

select throws_ok(
  $$ select public.admin_create_invite(null, 0) $$,
  '22023',
  null,
  'nor is one with no uses left before it starts'
);

-- The client used to be able to write this table directly. Both paths are now
-- definer functions that leave a trail, so the grants are gone — which is what
-- makes that true, rather than everybody agreeing to use the function.
select ok(
  not has_table_privilege('authenticated', 'public.invites', 'INSERT'),
  'no client can mint a code by hand'
);
select ok(
  not has_table_privilege('authenticated', 'public.invites', 'UPDATE'),
  'nor rewrite one'
);

select lives_ok(
  $$ select public.admin_revoke_invite('00000000-0000-4000-8000-0000000000c1') $$,
  'the junta can kill a code that has leaked'
);

select is(
  (select (public.invite_preview('ALFA-7F3K') ->> 'valid')),
  'false',
  'and it stops working immediately'
);

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.admin_create_invite() $$,
  '42501',
  null,
  'a member cannot make invitations'
);

-- ── saving an event ─────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_save_event(
       'Prova Alfa', 'casa_rural', now() + interval '20 days',
       p_ubicacion := 'Sala Bravo', p_descripcion := 'Descripcio') $$,
  'the junta can create an event'
);

-- The whole reason this is one function: two round trips can leave an event
-- whose detail row never arrived, and an absent detail row is exactly what a
-- reveal that has not happened looks like. The screen would look right and the
-- location would be gone.
select is(
  (select count(*)::int from public.event_details d
     join public.events e on e.id = d.event_id
    where e.titulo = 'Prova Alfa'),
  1,
  'and the detail row lands in the same transaction'
);

select is(
  (select puntos from public.events where titulo = 'Prova Alfa'),
  30,
  'points are pre-filled from the scale for that kind of event'
);

select is(
  (select count(*)::int from public.audit_log where accio = 'create_event'),
  1,
  'and creating one leaves a trail'
);

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.admin_save_event('Meva', 'fiesta', now() + interval '1 day') $$,
  '42501',
  null,
  'a member cannot create events'
);

-- ── the scale ───────────────────────────────────────────────────────────────
select ok(
  (select count(*) from public.point_values) >= 7,
  'a member can read the scale, which is what draws the buttons'
);

-- This was lives_ok until migration 25: an UPDATE the privilege layer allowed
-- and a policy filtered out touched zero rows and returned success. The write
-- grant is gone now, and privileges are checked before RLS, so it raises —
-- which is the stronger of the two, and the reason the revoke was the point of
-- that migration rather than the policy drop beside it.
select throws_ok(
  $$ update public.point_values set punts = 999 where clau = 'montaje' $$,
  '42501',
  null,
  'a member cannot rewrite the scale, stopped by the grant'
);

select is(
  (select punts from public.point_values where mena = 'motiu' and clau = 'montaje'),
  20,
  'and the scale is untouched, which is the half that has to be asserted'
);

select * from finish();
rollback;

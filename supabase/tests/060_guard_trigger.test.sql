-- The backstop, tested with the primary defence removed.
--
-- role and estat are protected twice: by a column grant (checked before RLS,
-- and the real enforcement) and by a BEFORE UPDATE trigger. The escalation
-- tests in 030 pass as soon as either one works, so they cannot tell whether
-- the trigger does anything at all.
--
-- It did not. The first version was SECURITY DEFINER, which meant its
-- `current_user <> 'authenticated'` test read the function owner and was true
-- on every call: enabled, firing, and waving everything through. Nothing in
-- the suite noticed, because the grants were carrying it. This file exists so
-- that cannot happen again — it hands the grant back and checks the trigger
-- alone still holds the line.

begin;
select plan(6);

-- Deliberately weaken the primary defence, inside a transaction that rolls
-- back. From here on, only the trigger stands between a member and 'owner'.
grant update (role, estat, qr_token) on public.profiles to authenticated;

reset role;
select tests.authenticate_as('alfa');

select is(current_user::text, 'authenticated', 'the session really is a member');

select throws_ok(
  $$ update public.profiles set role = 'owner'
      where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  'camps protegits: role, estat i qr_token nomes per rpc',
  'with the grant handed back, the trigger still blocks a role change'
);

-- Their OWN row. Aiming at somebody else's would match zero rows under RLS
-- and the trigger would never fire, so the test would pass without proving
-- anything — the exact failure mode this file was written to catch.
select throws_ok(
  $$ update public.profiles set estat = 'baixa'
      where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  'camps protegits: role, estat i qr_token nomes per rpc',
  'and an estat change on their own row'
);

select throws_ok(
  $$ update public.profiles set qr_token = gen_random_uuid()
      where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  'camps protegits: role, estat i qr_token nomes per rpc',
  'and a QR rotation done by hand rather than through the RPC'
);

-- The other half of the trigger's job: it must not fight the RPCs, which run
-- as the table owner and legitimately move people between states.
select lives_ok(
  $$ update public.profiles set nombre = 'Alfa canviat'
      where id = '00000000-0000-4000-8000-000000000001' $$,
  'an ordinary profile edit still goes through'
);

reset role;
select tests.authenticate_as('pendent_alfa');
select is(
  public.redeem_invite('CODI-VALID-0001') ->> 'ok',
  'true',
  'and redeem_invite can still move somebody from pendent to actiu'
);

select * from finish();
rollback;

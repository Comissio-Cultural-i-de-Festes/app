-- Test scaffolding. LOCAL AND CI ONLY.
--
-- This lives in supabase/seed/ and not in supabase/migrations/ on purpose:
-- `supabase start` and `supabase db reset` apply seeds, `supabase db push`
-- does not. Putting test helpers in a migration would ship them to the
-- association's real database, which in a public repo is exactly the kind of
-- thing that gets found.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
revoke all on schema tests from public, anon, authenticated;

create table if not exists tests.persona (
  handle text primary key,
  uid    uuid not null unique
);

-- Creating an auth user by hand couples us to GoTrue's internal schema, which
-- does change between CLI versions. The canary test in tests/rls/ turns "forty
-- tests failed mysteriously after a version bump" into "GoTrue changed, fix
-- this function".
--
-- The four token columns MUST be '' and not NULL: GoTrue's Go scanner cannot
-- read a NULL there and sign-in fails with an opaque 500, hours after you
-- wrote the seed.
create or replace function tests.create_user(
  p_handle text,
  p_uid uuid,
  p_role text default 'member',
  p_estat text default 'actiu',
  p_escola text default null
)
returns uuid
language plpgsql
as $$
declare v_email text := p_handle || '@example.test';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt('test-password-0000', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', initcap(p_handle)),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_uid, p_uid::text,
    jsonb_build_object('sub', p_uid::text, 'email', v_email),
    'email', now(), now(), now()
  );

  -- on_auth_user_created has already made the profile as pendent/member.
  update public.profiles
     set role = p_role, estat = p_estat, escola = p_escola
   where id = p_uid;

  insert into tests.persona (handle, uid) values (p_handle, p_uid)
  on conflict (handle) do update set uid = excluded.uid;

  return p_uid;
end $$;

create or replace function tests.uid(p_handle text)
returns uuid
language sql
stable
as $$ select uid from tests.persona where handle = p_handle $$;

create or replace function tests.qr(p_handle text)
returns uuid
language sql
stable
as $$ select p.qr_token from public.profiles p where p.id = tests.uid(p_handle) $$;

-- `set_config(..., true)` is the SET LOCAL form, so it unwinds with the test
-- transaction. SET ROLE permission is checked against the session user, not
-- the current one, so personas can be switched repeatedly without resetting.
create or replace function tests.authenticate_as(p_handle text)
returns void
language plpgsql
as $$
declare v_uid uuid := tests.uid(p_handle);
begin
  if v_uid is null then
    raise exception 'unknown persona %', p_handle;
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_uid::text,
      'role', 'authenticated',
      'email', p_handle || '@example.test'
    )::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;

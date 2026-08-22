-- What a member cannot do.
--
-- Note the convention: `reset role;` before every `tests.authenticate_as`.
-- The tests schema is revoked from authenticated (it must never look like
-- something production could reach), so the helper is only callable from the
-- session role.
--
-- UUIDs are written out rather than looked up through tests.uid(). A bug in a
-- fixture lookup must not be able to make a security assertion pass vacuously.

begin;
select plan(12);

reset role;
select tests.authenticate_as('alfa');

-- ── the points ledger ───────────────────────────────────────────────────────
select throws_ok(
  $$ insert into public.points_log (user_id, motivo, puntos)
     values ('00000000-0000-4000-8000-000000000001', 'manual', 999) $$,
  '42501',
  null,
  'a member cannot insert into points_log'
);

select throws_ok(
  $$ update public.points_log set puntos = 999 $$,
  '42501',
  null,
  'a member cannot update points_log, not even their own rows'
);

select throws_ok(
  $$ delete from public.points_log $$,
  '42501',
  null,
  'a member cannot delete from points_log'
);

select is(
  (select count(*)::int from public.points_log),
  1,
  'a member sees only their own ledger rows'
);

-- ── identity ────────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.profiles set role = 'owner'
      where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a member cannot promote themselves'
);

select throws_ok(
  $$ update public.profiles set estat = 'actiu'
      where id = '00000000-0000-4000-8000-0000000000b1' $$,
  '42501',
  null,
  'a member cannot approve a pending account'
);

-- A policy that only checks `id = auth.uid()` would wave this through: RLS
-- has no way to compare the new row to the old one.
select throws_ok(
  $$ update public.profiles set nombre = 'x', role = 'admin'
      where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'role cannot ride along with a legitimate field'
);

select throws_ok(
  $$ select qr_token from public.profiles
      where id = '00000000-0000-4000-8000-000000000002' $$,
  '42501',
  null,
  'a member cannot read anyone else''s QR token'
);

select isnt(
  (select public.my_qr()),
  null,
  'but they can read their own, through my_qr()'
);

-- ── attendance ──────────────────────────────────────────────────────────────
-- Self check-in is the single most valuable bypass in the system: it writes
-- the attendance AND, if the rest of the path followed, the points.
select throws_ok(
  $$ update public.attendances set estado = 'asistio'
      where user_id = '00000000-0000-4000-8000-000000000001'
        and event_id = '00000000-0000-4000-8000-0000000000e1' $$,
  '42501',
  null,
  'a member cannot check themselves in'
);

select throws_ok(
  $$ update public.attendances set pagado = true
      where user_id = '00000000-0000-4000-8000-000000000001' $$,
  '42501',
  null,
  'a member cannot mark themselves as paid'
);

select throws_ok(
  $$ insert into public.attendances (user_id, event_id, estado)
     values ('00000000-0000-4000-8000-000000000007',
             '00000000-0000-4000-8000-0000000000e1', 'si') $$,
  '42501',
  null,
  'a member cannot sign somebody else up'
);

select * from finish();
rollback;

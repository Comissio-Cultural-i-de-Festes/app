-- Asking for a place, on an event where asking is not having.
--
-- The assertion this file exists for is the guard: a member must not be able
-- to write `si` on an event that needs deciding. Everything else here is
-- bookkeeping — without that one line the request state is one PATCH away
-- from the confirmed one and the whole thing is decoration.

begin;
select plan(17);

reset role;
delete from public.audit_log;

create temporary table who as
select
  tests.uid('alfa')  as alfa,
  tests.uid('bravo') as bravo,
  '00000000-0000-4000-8000-0000000000c1'::uuid as casa;
grant select on who to authenticated;

-- One place, and it has to be given rather than taken.
insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, published, cal_confirmacio)
values
  ((select casa from who),'casa_rural',now() + interval '30 days',1,3000,30,true,true);

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ((select casa from who), 'Casa rural de prova')
on conflict (event_id) do update set titulo = excluded.titulo;

-- ── asking ──────────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select is(
  public.set_attendance((select casa from who), 'si')->>'estado',
  'sollicitat',
  'a yes on an event that needs deciding is a request, not a place'
);

select is(
  public.set_attendance((select casa from who), 'si')->>'cal_confirmacio',
  'true',
  'and it says so, so the screen can say so too'
);

reset role;
select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = (select casa from who)),
  'sollicitat',
  'which is what is written down'
);

select ok(
  private.event_needs_confirming((select casa from who)),
  'the event is flagged'
);

-- The place is still free: this is the difference between a request and a
-- booking, and every count in the app reads it from here.
select ok(
  private.event_has_room((select casa from who)),
  'a request occupies nothing, so the one place is still there'
);

-- ── the guard ───────────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  $$ update public.attendances set estado = 'si'
      where user_id = (select auth.uid()) and event_id = (select casa from who) $$,
  '42501',
  null,
  'a member cannot award themselves the place the junta has not given'
);

select throws_ok(
  $$ update public.attendances set estado = 'rebutjat'
      where user_id = (select auth.uid()) and event_id = (select casa from who) $$,
  '42501',
  null,
  'nor put words in anybody''s mouth by refusing themselves'
);

reset role;
select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = (select casa from who)),
  'sollicitat',
  'and the row is untouched, which is the half that has to be asserted'
);

-- Another member cannot see the request at all: att_select_public_si publishes
-- only ('si', 'asistio'), so a request fails closed like the waiting list.
select tests.authenticate_as('bravo');
select is_empty(
  $$ select 1 from public.attendances where event_id = (select casa from who) $$,
  'and nobody else can see who has asked'
);

select throws_ok(
  $$ select public.admin_decide_attendance(
       (select casa from who), (select alfa from who), true) $$,
  '42501',
  'nomes junta',
  'a member cannot decide either'
);

-- ── deciding ────────────────────────────────────────────────────────────────
-- `reset role` first: tests.* is revoked from `authenticated`, so switching
-- persona while still wearing one raises instead of switching.
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_decide_attendance((select casa from who), (select bravo from who), true)->>'estat',
  'no_demanat',
  'deciding about somebody who never asked says so instead of inventing a row'
);

select is(
  public.admin_decide_attendance((select casa from who), (select alfa from who), true)->>'estat',
  'si',
  'the junta can give the place'
);

reset role;
select is(
  (select estado from public.attendances
    where user_id = (select alfa from who) and event_id = (select casa from who)),
  'si',
  'and now it is a place'
);

select ok(
  not private.event_has_room((select casa from who)),
  'which takes the last one'
);

select is(
  (select detall->>'accepta' from public.audit_log where accio = 'decide_attendance'),
  'true',
  'with a trail: who goes on the trip is the decision most asked about later'
);

-- ── and the cap holds ───────────────────────────────────────────────────────
select tests.authenticate_as('bravo');
select public.set_attendance((select casa from who), 'si');

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_decide_attendance((select casa from who), (select bravo from who), true)->>'estat',
  'sense_places',
  'a second yes past the cap is refused with words, not overfilled'
);

reset role;
select is(
  (select estado from public.attendances
    where user_id = (select bravo from who) and event_id = (select casa from who)),
  'sollicitat',
  'and that person is still waiting rather than quietly turned down'
);

select * from finish();
rollback;

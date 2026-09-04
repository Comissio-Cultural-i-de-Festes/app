-- Les vuit RPC que no tenien cap prova.
--
-- L'AUDITORIA EN VA TROBAR NOU sense cap test a cap capa. Una,
-- `claim_first_owner`, ja no existeix —migració 55—; aquestes vuit sí, i totes
-- vuit tenen una verja que ningú no havia vist disparar-se mai:
--
--   admin_set_paid      admin_save_geo      award_points        admin_undo_prova
--   ride_candidates     gimcana_teams       pick_team           rotate_qr_token
--
-- CADA VERJA VA AMB EL SEU CONTROL POSITIU, i no és zel: el que va costar la
-- migració 54 va ser justament una tanca massa ampla que cap prova va veure,
-- perquè totes miraven el costat negatiu. Aquí, per a cada refús hi ha algú a
-- qui ha de deixar passar.
--
-- DUES D'AQUESTES VERGES SÓN MÉS FLUIXES QUE LES SEVES GERMANES, i el test ho
-- fixa tal com és avui en lloc d'afirmar el que voldríem:
--
--   `rotate_qr_token` només exigeix que hi hagi sessió, no `is_active_member()`,
--   així que un pendent i una baixa en treuen token nou. Les seves germanes
--   demanen ser soci actiu.
--
--   `pick_team` no crida `gimcana_is_open()` com les seves germanes, així que
--   deixa canviar d'equip amb la gimcana tancada.
--
-- Les dues van al backlog de l'auditoria com a severitat baixa. El test les
-- deixa escrites perquè el dia que es tanquin, es vegi què canvia.
--
-- Els UUID van escrits sencers a les assercions de seguretat.
-- Persones i coses inventades, com a tot el repo.

begin;
select plan(26);

reset role;

-- ── El món de la prova ──────────────────────────────────────────────────────
--
-- El seed no porta ni gimcanes ni cotxes, o sigui que «no es veu res» no
-- distingiria una verja que funciona d'una taula buida. Se'n posa un de cada.

create temporary table w as
select
  '00000000-0000-4000-8000-0000000000e1'::uuid as festa,
  '00000000-0000-4000-8000-0000cccc0001'::uuid as gimcana,
  '00000000-0000-4000-8000-0000cccc0011'::uuid as equip_u,
  '00000000-0000-4000-8000-0000cccc0012'::uuid as equip_dos,
  '00000000-0000-4000-8000-0000cccc0021'::uuid as prova,
  '00000000-0000-4000-8000-0000cccc0031'::uuid as enviament,
  '00000000-0000-4000-8000-0000cccc0041'::uuid as cotxe,
  (select id from public.attendances
    where event_id = '00000000-0000-4000-8000-0000000000e1'::uuid limit 1) as assistencia;
grant select on w to authenticated;

insert into public.gimcanes (id, event_id, mena_equips, created_by)
values ((select gimcana from w), (select festa from w), 'lliure',
        '00000000-0000-4000-8000-0000000000a1');

insert into public.gimcana_equips (id, gimcana_id, nom, ordre) values
  ((select equip_u from w),   (select gimcana from w), 'Equip U',   1),
  ((select equip_dos from w), (select gimcana from w), 'Equip Dos', 2);

insert into public.gimcana_proves (id, gimcana_id, titol, punts, ordre)
values ((select prova from w), (select gimcana from w), 'Prova inventada', 10, 1);

insert into public.gimcana_enviaments (id, prova_id, user_id, equip_id, path, estat)
values ((select enviament from w), (select prova from w),
        '00000000-0000-4000-8000-000000000001', (select equip_u from w),
        'auditoria/prova.jpg', 'validada');

insert into public.rides (id, event_id, driver_id, sentit, origen, places)
values ((select cotxe from w), (select festa from w),
        '00000000-0000-4000-8000-000000000001', 'anada', 'Punt Alfa', 3);

-- ── admin_set_paid ──────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  format($$ select public.admin_set_paid(%L, true) $$, (select assistencia from w)),
  '42501', null, 'admin_set_paid: un soci no toca cap pagament'
);

reset role;
select tests.authenticate_as('pendent_alfa');
select throws_ok(
  format($$ select public.admin_set_paid(%L, true) $$, (select assistencia from w)),
  '42501', null, 'admin_set_paid: ni un pendent'
);

reset role;
select tests.authenticate_as('junta_alfa');
select lives_ok(
  format($$ select public.admin_set_paid(%L, true) $$, (select assistencia from w)),
  'admin_set_paid: la junta sí'
);

-- ── award_points ────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'manual', 5, 'audit') $$,
  '42501', null, 'award_points: un soci no dona punts'
);

reset role;
select tests.authenticate_as('junta_alfa');
select lives_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'manual', 5, 'audit') $$,
  'award_points: la junta sí'
);

-- Restar punts és només de l'owner, que és una verja DINS de la verja.
select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'manual', -5, 'audit') $$,
  '42501', null, 'award_points: un admin no pot restar punts'
);

reset role;
select tests.authenticate_as('cap');
select lives_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'manual', -5, 'audit') $$,
  'award_points: l''owner sí que pot restar-ne'
);

-- I els topalls, que són l'altra meitat del que aquesta funció defensa.
select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'inventat', 5, 'audit') $$,
  '22023', null, 'award_points: un motiu inventat no passa'
);

select throws_ok(
  $$ select public.award_points('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-0000000000e1', 'manual', 9999, 'audit') $$,
  '22023', null, 'award_points: nou mil punts tampoc'
);

-- ── admin_save_geo ──────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.admin_save_geo('00000000-0000-4000-8000-0000000000e1',
       40.1234, 1.5678, 150) $$,
  '42501', null, 'admin_save_geo: un soci no mou el punt del mapa'
);

reset role;
select tests.authenticate_as('junta_alfa');
select lives_ok(
  $$ select public.admin_save_geo('00000000-0000-4000-8000-0000000000e1',
       40.1234, 1.5678, 150) $$,
  'admin_save_geo: la junta sí'
);

-- ── admin_undo_prova ────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  format($$ select public.admin_undo_prova(%L) $$, (select enviament from w)),
  '42501', null, 'admin_undo_prova: un soci no desfà cap validació'
);

reset role;
select tests.authenticate_as('junta_alfa');
select lives_ok(
  format($$ select public.admin_undo_prova(%L) $$, (select enviament from w)),
  'admin_undo_prova: la junta sí'
);

-- ── ride_candidates ─────────────────────────────────────────────────────────
--
-- Filtra en silenci en lloc d'aixecar error, i és correcte: per llegir, un
-- USING que no encaixa vol dir zero files. El que cal provar és que el silenci
-- no sigui el mateix per a tothom.

reset role;
select tests.authenticate_as('bravo');
select is_empty(
  format($$ select 1 from public.ride_candidates(%L) $$, (select cotxe from w)),
  'ride_candidates: qui no és el conductor no veu candidats'
);

reset role;
select tests.authenticate_as('junta_alfa');
select is_empty(
  format($$ select 1 from public.ride_candidates(%L) $$, (select cotxe from w)),
  'ride_candidates: ni la junta, que aquí no hi té res a dir'
);

reset role;
select tests.authenticate_as('alfa');
select isnt_empty(
  format($$ select 1 from public.ride_candidates(%L) $$, (select cotxe from w)),
  'ride_candidates: el conductor sí, o el botó no serviria de res'
);

-- ── gimcana_teams ───────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('pendent_alfa');
select is_empty(
  format($$ select 1 from public.gimcana_teams(%L) $$, (select gimcana from w)),
  'gimcana_teams: un pendent no veu els equips'
);

reset role;
select tests.authenticate_as('baixa_alfa');
select is_empty(
  format($$ select 1 from public.gimcana_teams(%L) $$, (select gimcana from w)),
  'gimcana_teams: ni una baixa'
);

reset role;
select tests.authenticate_as('alfa');
select is(
  (select count(*)::int from public.gimcana_teams((select gimcana from w))),
  2,
  'gimcana_teams: un soci actiu veu els dos equips'
);

-- ── pick_team ───────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('pendent_alfa');
select throws_ok(
  format($$ select public.pick_team(%L) $$, (select equip_u from w)),
  '42501', null, 'pick_team: un pendent no tria equip'
);

reset role;
select tests.authenticate_as('baixa_alfa');
select throws_ok(
  format($$ select public.pick_team(%L) $$, (select equip_u from w)),
  '42501', null, 'pick_team: ni una baixa'
);

reset role;
select tests.authenticate_as('bravo');
select is(
  (select public.pick_team((select equip_u from w)) ->> 'estat'),
  'fet',
  'pick_team: un soci actiu sí'
);

-- ── rotate_qr_token ─────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.rotate_qr_token() $$,
  '42501', null, 'rotate_qr_token: anon no en treu cap'
);

reset role;
select tests.authenticate_as('alfa');
select isnt(
  (select public.rotate_qr_token()),
  null,
  'rotate_qr_token: un soci actiu sí'
);

-- La verja fluixa, escrita tal com és. `is_active_member()` és el que demanen
-- les seves germanes; aquesta només mira que hi hagi sessió. Si algun dia es
-- tanca, aquestes dues assercions són les que ho diran.
reset role;
select tests.authenticate_as('pendent_alfa');
select isnt(
  (select public.rotate_qr_token()),
  null,
  'rotate_qr_token: AVUI un pendent també en treu (verja mes fluixa que les germanes)'
);

reset role;
select tests.authenticate_as('baixa_alfa');
select isnt(
  (select public.rotate_qr_token()),
  null,
  'rotate_qr_token: AVUI una baixa també (mateix motiu)'
);

select * from finish();
rollback;

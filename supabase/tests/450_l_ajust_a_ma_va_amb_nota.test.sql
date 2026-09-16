-- L'ajust a mà, i les dues regles que la migració 69 posa dins de la base.
--
-- Les dues es podrien escriure al formulari i les dues hi són escrites; això
-- prova que també hi són sense formulari. La distinció no és teòrica: la RPC
-- té el grant per a `authenticated` sencer, o sigui que qualsevol de la junta
-- la pot cridar des de la consola del navegador amb els paràmetres que
-- vulgui.
--
-- El que NO canvia també es prova: els quatre motius de la porta continuen
-- sent positius per a un admin, i restar-hi continua sent de l'owner. Sense
-- aquestes dues assercions, obrir el negatiu sencer per error passaria el
-- fitxer igual.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(14);

reset role;
delete from public.audit_log;

-- ── `manual` vol nota ───────────────────────────────────────────────────────

select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, null) $$,
  '22023',
  'un ajust a ma vol una nota',
  'un ajust a ma sense nota no entra'
);

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, '   ') $$,
  '22023',
  'un ajust a ma vol una nota',
  'ni amb tres espais, que es una nota buida amb una altra cara'
);

reset role;
-- Fitat a l'alfa: la llavor ja porta dues files `manual` d'altra gent, i una
-- comprovacio sobre la taula sencera passaria o fallaria per elles.
select is_empty(
  $$ select 1 from public.points_log
      where motivo = 'manual'
        and user_id = '00000000-0000-4000-8000-000000000001' $$,
  'i no ha quedat cap fila: el refus es abans de l''insert'
);

-- ── amb nota, entra ─────────────────────────────────────────────────────────

select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, '  Va portar el projector  ') $$,
  'amb nota si, i sense esdeveniment: p_event_id es nullable a posta'
);

reset role;
select is(
  (select nota from public.points_log
    where motivo = 'manual' and user_id = '00000000-0000-4000-8000-000000000001'),
  'Va portar el projector',
  'la nota es desa retallada, no tal com ha arribat'
);

select is(
  (select event_id from public.points_log
    where motivo = 'manual' and user_id = '00000000-0000-4000-8000-000000000001'),
  null,
  'i un ajust sense esdeveniment es una fila legal'
);

select is(
  (select detall->>'nota' from public.audit_log
    where accio = 'award_points' order by created_at desc limit 1),
  'Va portar el projector',
  'el registre diu el per que, que es l''unica part que algu preguntara'
);

select is(
  (select target_id from public.audit_log
    where accio = 'award_points' order by created_at desc limit 1),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'i diu a qui'
);

-- ── un admin pot restar, però només per `manual` ────────────────────────────

select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', -20, 'Comptats dos cops el mateix vespre') $$,
  'un admin resta per manual, perque una resta per manual no pot ser muda'
);

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'montaje', -20, 'i amb nota tampoc') $$,
  '42501',
  'nomes owner pot restar punts',
  'pero no per un motiu de la porta, ni escrivint-hi una nota al costat'
);

-- ── l'owner continua podent-ho tot ──────────────────────────────────────────

reset role;
select tests.authenticate_as('cap');

select lives_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'montaje', -20, null) $$,
  'l''owner resta per qualsevol motiu, com fins ara'
);

-- ── i el que no ha canviat ──────────────────────────────────────────────────

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-0000000000e1', 'montaje', 20, null) $$,
  'els quatre botons de la porta continuen sense demanar nota'
);

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 900, 'molt') $$,
  '22023',
  'punts fora de rang',
  'i el sostre de 500 per crida es el de sempre'
);

-- Un soci no hi arriba, encara que porti la nota escrita.
reset role;
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, 'jo mateix') $$,
  '42501',
  'nomes junta',
  'i qui no es de la junta no ajusta res'
);

select * from finish();
rollback;

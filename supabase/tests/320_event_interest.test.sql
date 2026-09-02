-- «Avisa'm», i què n'és públic.
--
-- LA REGLA QUE AQUEST FITXER DEFENSA té dues meitats que van juntes: el
-- *nombre* de gent que espera una revelació és públic —és el que fa que la
-- pantalla del teaser funcioni— i *qui* són no ho és. Una sola d'aquestes dues
-- coses no és la funció: sense el nombre no hi ha res a ensenyar, i amb la
-- llista qualsevol soci es podria descarregar qui espera cada festa.
--
-- I ES DEFENSA AMB UN GRANT I NO AMB UNA POLÍTICA, que és el que fa que valgui
-- la pena assertar-ho: `authenticated` no té SELECT sobre la taula, i els
-- privilegis es miren abans que l'RLS. Una política que filtrés per
-- `auth.uid()` semblaria igual de segura i deixaria la porta oberta el dia que
-- algú afegís el grant «perquè feia falta per a una pantalla».
--
-- Els UUID van escrits sencers a les assercions de seguretat.
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(16);

reset role;

-- ── el grant, que és la barrera de debò ─────────────────────────────────────
select is(
  (select count(*)::int
     from information_schema.column_privileges
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'event_interest'
      and privilege_type = 'SELECT'),
  0,
  'authenticated no té SELECT sobre event_interest, ni per columnes'
);

select ok(
  has_table_privilege('authenticated', 'public.event_interest', 'INSERT'),
  'però sí INSERT, que és com es prem el botó'
);

select ok(
  has_table_privilege('authenticated', 'public.event_interest', 'DELETE'),
  'i DELETE, que és com es desprem'
);

-- ── un soci el prem ─────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select lives_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-0000000000e2', true) $$,
  'un soci pot dir que vol que se l''avisi d''un esdeveniment no revelat'
);

select is(
  (select public.my_event_interest('00000000-0000-4000-8000-0000000000e2')),
  true,
  'i el botó ho pot saber, que és el que necessita per dibuixar-se'
);

select is(
  (select public.event_interest_size('00000000-0000-4000-8000-0000000000e2')),
  1,
  'i el nombre és públic'
);

-- Dues vegades és la mateixa intenció. La clau primària composta ho fa
-- idempotent sense cap columna d'estat.
select lives_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-0000000000e2', true) $$,
  'prémer-lo dues vegades no és un error'
);

select is(
  (select public.event_interest_size('00000000-0000-4000-8000-0000000000e2')),
  1,
  'i no compta dues vegades'
);

-- ── i un altre soci no pot saber qui és ─────────────────────────────────────
reset role;
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select user_id from public.event_interest $$,
  '42501',
  null,
  'ningú no pot llistar qui espera una revelació'
);

select is(
  (select public.event_interest_size('00000000-0000-4000-8000-0000000000e2')),
  1,
  'però el nombre sí que el veu, que és tot el que la pantalla ensenya'
);

select is(
  (select public.my_event_interest('00000000-0000-4000-8000-0000000000e2')),
  false,
  'i el seu propi estat és el seu, no el de l''altre'
);

-- ── desprémer-lo ────────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select lives_ok(
  $$ select public.set_event_interest('00000000-0000-4000-8000-0000000000e2', false) $$,
  'i es pot desdir'
);

select is(
  (select public.event_interest_size('00000000-0000-4000-8000-0000000000e2')),
  0,
  'i llavors el nombre baixa'
);

-- ── la xarxa de seguretat ───────────────────────────────────────────────────
-- «Ja es pot dir»: què es va revelar mentre no miraves. Sense estat nou —surt
-- de l'interès, la revelació i el fet de no haver contestat— i per tant el que
-- s'ha de provar és que les tres condicions es respecten.
reset role;
select tests.authenticate_as('alfa');
select public.set_event_interest('00000000-0000-4000-8000-0000000000e2', true);

select is_empty(
  $$ select public.my_revealed_interests() $$,
  'un esdeveniment que encara no s''ha revelat no hi surt'
);

reset role;
update public.events set reveal_at = now() - interval '1 hour'
 where id = '00000000-0000-4000-8000-0000000000e2';

select tests.authenticate_as('alfa');
select results_eq(
  $$ select public.my_revealed_interests() $$,
  $$ values ('00000000-0000-4000-8000-0000000000e2'::uuid) $$,
  'i un que sí, sí'
);

-- Contestar el treu, i és així com la targeta es descarta sola. Qualsevol
-- resposta compta, el «no» inclòs: qui ha dit que no ja ha vist de què anava.
select public.set_attendance('00000000-0000-4000-8000-0000000000e2', 'no');
select is_empty(
  $$ select public.my_revealed_interests() $$,
  'i contestar-lo el treu, que és com la targeta desapareix sense cap columna de «vist»'
);

reset role;
select * from finish();
rollback;

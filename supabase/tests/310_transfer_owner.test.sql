-- El traspàs de la propietat, i l'últim owner.
--
-- LA INVARIANT QUE AQUEST FITXER DEFENSA és que hi hagi sempre exactament un
-- owner. La base no la pot expressar: `role` és text amb un CHECK, i «com a
-- màxim una fila amb aquest valor» seria un índex únic parcial que trencaria
-- el bootstrap. Sense aquest fitxer, «zero owners» és un estat irrecuperable
-- —ningú no pot nomenar-ne cap— al qual s'hi arriba amb dues crides.
--
-- I EL FORAT QUE S'OMPLE DE PASSADA. Les dues proteccions d'últim owner
-- d'`admin_set_member_estat` (migració 06) no les cobria res, i el comentari
-- del seu propi codi les anomena «where it can go irrecoverably wrong». Van
-- aquí perquè són la mateixa invariant vista des de l'altra columna: pel rol i
-- per l'estat es pot arribar al mateix lloc.
--
-- Els UUID van escrits sencers a les assercions de seguretat: un error de
-- fixture no ha de poder fer passar en va cap d'aquestes.
-- Persones inventades, com a tot el repo.

begin;
select plan(17);

reset role;
delete from public.audit_log;

-- ── el punt de partida ──────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.profiles where role = 'owner' and estat = 'actiu'),
  1,
  'hi ha exactament un owner per començar, o la resta del fitxer no prova res'
);

-- ── qui no pot traspassar ───────────────────────────────────────────────────
select tests.authenticate_as('alfa');
select throws_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a1') $$,
  '42501',
  null,
  'un soci no pot traspassar la propietat'
);

reset role;
select tests.authenticate_as('junta_alfa');
select throws_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a2') $$,
  '42501',
  null,
  'ni un admin, que és el cas que la pantalla amaga i la base ha de refusar igual'
);

-- ── i on no pot anar ────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('cap');

select throws_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'no a un soci: donar-la a qui no porta res és donar-la a qui no sap que la té'
);

select throws_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a9') $$,
  '42501',
  null,
  'ni a un mateix'
);

select throws_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-00000000dead') $$,
  '42501',
  null,
  'ni a un perfil que no existeix'
);

-- Un admin donat de baixa tampoc. La pantalla només llista actius, però la
-- llista es pot haver carregat abans de la baixa.
reset role;
update public.profiles set estat = 'baixa'
 where id = '00000000-0000-4000-8000-0000000000a3';

select tests.authenticate_as('cap');
select throws_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a3') $$,
  '42501',
  null,
  'ni a un admin que ja no és actiu'
);

reset role;
update public.profiles set estat = 'actiu'
 where id = '00000000-0000-4000-8000-0000000000a3';

-- ── el traspàs de debò ──────────────────────────────────────────────────────
select tests.authenticate_as('cap');
select lives_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a1') $$,
  'un owner la traspassa a un admin'
);

select is(
  (select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  'owner',
  'i l''altre és owner de debò'
);

select is(
  (select role from public.profiles where id = '00000000-0000-4000-8000-0000000000a9'),
  'admin',
  'i qui la tenia ha baixat a admin en la mateixa transacció'
);

select is(
  (select count(*)::int from public.profiles where role = 'owner' and estat = 'actiu'),
  1,
  'i segueix havent-hi exactament un owner, que és tot el sentit de la funció'
);

select is(
  (select count(*)::int from public.audit_log where accio = 'transfer_owner'),
  1,
  'amb la seva línia al registre: el juny que ve algú preguntarà qui la va donar'
);

select is(
  (select detall ->> 'a' from public.audit_log where accio = 'transfer_owner'),
  '00000000-0000-4000-8000-0000000000a1',
  'i el registre diu a qui'
);

-- Qui l'acaba de rebre la pot tornar. La pantalla ho diu així: «des d'aquest
-- moment només ella pot tornar-te-la».
reset role;
select tests.authenticate_as('junta_alfa');
select lives_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a9') $$,
  'i qui l''ha rebuda la pot tornar, que és l''única sortida que la pantalla promet'
);

-- ── l'altra porta al mateix lloc: l'estat ───────────────────────────────────
-- `admin_set_member_estat` guarda l'últim owner, i això no ho provava res.
reset role;
select tests.authenticate_as('junta_alfa');
select throws_ok(
  $$ select public.admin_set_member_estat(
       '00000000-0000-4000-8000-0000000000a9', 'baixa') $$,
  '42501',
  null,
  'un admin no pot donar de baixa l''owner'
);

reset role;
select tests.authenticate_as('cap');
select throws_ok(
  $$ select public.admin_set_member_estat(
       '00000000-0000-4000-8000-0000000000a9', 'baixa') $$,
  '42501',
  null,
  'ni l''owner a si mateix, que deixaria l''associació sense ningú que pugui nomenar'
);

select is(
  (select count(*)::int from public.profiles where role = 'owner' and estat = 'actiu'),
  1,
  'i després de tot això encara n''hi ha exactament un'
);

reset role;
select * from finish();
rollback;

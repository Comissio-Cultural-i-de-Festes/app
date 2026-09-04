-- La porta d'arrencada de la propietat, i que ja no hi és.
--
-- LA MIGRACIÓ 55 RETIRA `claim_first_owner()`. Aquest fitxer defensa les dues
-- meitats del motiu, perquè cap de les dues es veu enlloc:
--
--   1. Que la funció no hi torni. Un `create or replace` a una migració futura
--      la ressuscitaria sense que res ho digués, i el forat és prou lleig com
--      per merèixer una asserció que ho aturi.
--
--   2. Que quedar-se sense owner no obri cap porta. És l'escenari que ningú
--      havia provat: la tanca antiga era «no existeix cap owner», i per tant
--      només es podia comprovar traient la fila d'owner, que és exactament el
--      que cap test feia. Aquí es treu.
--
-- EL CAMÍ QUE HI PORTAVA, per si algú es pregunta si l'escenari és realista:
-- `profiles.id` referencia `auth.users(id)` amb ON DELETE CASCADE, així que qui
-- té la propietat esborrant el seu compte de Google es porta la seva fila. No
-- fa falta res més estrany que això.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(9);

reset role;

-- ── 1. La funció no hi és ───────────────────────────────────────────────────

select hasnt_function(
  'public', 'claim_first_owner', array[]::text[],
  'claim_first_owner ja no existeix'
);

-- I cap altra funció de public l'ha substituïda amb un altre nom: res del que
-- `authenticated` pot executar escriu `role` sense passar per una comprovació
-- d'admin. La llista blanca són les dues RPC que sí que hi toquen a posta.
select is_empty(
  $$
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'execute')
       and p.prosrc ~* 'set\s+role\s*='
       and p.proname not in ('admin_set_member_role', 'admin_transfer_owner')
  $$,
  'cap altra funció executable per authenticated escriu role'
);

-- ── 2. Sense cap owner, ningú no es fa owner ────────────────────────────────

-- Es treu la propietat. La transacció fa rollback al final, així que això no
-- surt d'aquí.
update public.profiles set role = 'admin' where role = 'owner';

select is(
  (select count(*)::int from public.profiles where role = 'owner'),
  0,
  'escenari muntat: no queda cap owner'
);

-- Un compte pendent d'aprovació. És el pitjor cas: mai ha estat soci.
reset role;
select tests.authenticate_as('pendent_alfa');

select throws_ok(
  $$ update public.profiles set role = 'owner' where id = (select auth.uid()) $$,
  '42501',
  null,
  'un pendent no es pot fer owner escrivint la columna'
);

select is(
  (select count(*)::int from public.profiles where role = 'owner'),
  0,
  'i segueix sense haver-hi owner'
);

-- Un soci actiu tampoc, que és la altra meitat: no és una qüestió d'estar
-- aprovat, és que aquesta columna no la escriu ningú des de fora.
reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  $$ update public.profiles set role = 'owner' where id = (select auth.uid()) $$,
  '42501',
  null,
  'un soci actiu tampoc no es pot fer owner'
);

-- I un admin, que és qui més a prop està, tampoc no es puja sol.
reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_set_member_role('00000000-0000-4000-8000-0000000000a1', 'owner') $$,
  '42501',
  null,
  'un admin no es pot nomenar owner a si mateix'
);

select is(
  (select count(*)::int from public.profiles where role = 'owner'),
  0,
  'sense owner, la propietat no es recupera des de dins de l''app'
);

-- ── 3. El control positiu ───────────────────────────────────────────────────
--
-- Sense això, les set assercions de dalt passarien igual si `profiles` fos de
-- només lectura per a tothom, i el fitxer no provaria res. Amb owner viu, el
-- traspàs legítim ha de seguir funcionant.

reset role;
update public.profiles set role = 'owner'
 where id = '00000000-0000-4000-8000-0000000000a9';

select tests.authenticate_as('cap');

select lives_ok(
  $$ select public.admin_transfer_owner('00000000-0000-4000-8000-0000000000a1') $$,
  'i qui té la propietat encara la pot traspassar'
);

select * from finish();
rollback;

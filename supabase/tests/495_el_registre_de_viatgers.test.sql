-- Les dades del registre de viatgers: qui les escriu, qui les llegeix, quan
-- se'n van i què queda escrit cada cop que la junta les obre.
--
-- AQUESTES SÓN LES DADES MÉS DELICADES DE L'APP —un número de document, una
-- data de naixement i una adreça— i per això cada «no» d'aquí va amb el seu
-- «sí» al costat: una verja que no deixa passar ningú també passaria tots els
-- «no». I cada «no» que és un WITH CHECK asserta el 42501, no zero files: un
-- USING filtra en silenci i un test que comptés files passaria per sempre.
--
-- Els documents són els exemples de llibre (12345678Z, X1234567L), no de
-- ningú. Els telèfons comencen per 9 i no poden ser el mòbil de ningú.

begin;
select plan(59);

reset role;

-- ── el món de la prova ─────────────────────────────────────────────────────
--
-- Una casa que demana les dades (V), una que no (W), una que va acabar fa
-- deu dies (P), una que va acabar fa sis (Q) i una sense hora de final que va
-- començar fa vuit dies (S). Totes fetes aquí: el seed no en porta cap que
-- demani dades, i «no surt res» no distingiria una verja d'una taula buida.

create temporary table w as
select
  '00000000-0000-4000-8000-0000000064a1'::uuid as v,
  '00000000-0000-4000-8000-0000000064a2'::uuid as w,
  '00000000-0000-4000-8000-0000000064a3'::uuid as p,
  '00000000-0000-4000-8000-0000000064a4'::uuid as q,
  '00000000-0000-4000-8000-0000000064a5'::uuid as s,
  '00000000-0000-4000-8000-0000000064a6'::uuid as r,
  '00000000-0000-4000-8000-000000000002'::uuid as bravo,
  '00000000-0000-4000-8000-000000000003'::uuid as charlie,
  '00000000-0000-4000-8000-000000000005'::uuid as echo,
  '00000000-0000-4000-8000-000000000007'::uuid as golf,
  '00000000-0000-4000-8000-000000000008'::uuid as hotel;
grant select on w to authenticated;

insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, published, created_by, demana_viatger)
values
  ((select v from w), 'casa_rural', now() + interval '10 days', 20, 0, 30, true, '00000000-0000-4000-8000-0000000000a1', true),
  ((select w from w), 'casa_rural', now() + interval '10 days', 20, 0, 30, true, '00000000-0000-4000-8000-0000000000a1', false),
  ((select p from w), 'casa_rural', now() - interval '12 days', 20, 0, 30, true, '00000000-0000-4000-8000-0000000000a1', true),
  ((select q from w), 'casa_rural', now() - interval '8 days',  20, 0, 30, true, '00000000-0000-4000-8000-0000000000a1', true),
  ((select s from w), 'actividad',  now() - interval '8 days',  20, 0, 30, true, '00000000-0000-4000-8000-0000000000a1', true),
  ((select r from w), 'reunio',     now() + interval '10 days', null, 0, 0, true, '00000000-0000-4000-8000-0000000000a1', false);

-- Una casa de tres dies: és el final, i no l'inici, el que compta.
insert into public.event_details (event_id, ends_at) values
  ((select v from w), now() + interval '12 days'),
  ((select w from w), now() + interval '12 days'),
  ((select p from w), now() - interval '10 days'),
  ((select q from w), now() - interval '6 days');

insert into public.attendances (user_id, event_id, estado) values
  ((select charlie from w), (select v from w), 'si'),
  ((select bravo from w),   (select v from w), 'si'),
  ((select golf from w),    (select v from w), 'espera'),
  ((select echo from w),    (select v from w), 'potser'),
  ((select hotel from w),   (select v from w), 'si'),
  ((select charlie from w), (select w from w), 'si'),
  ((select charlie from w), (select p from w), 'asistio'),
  ((select charlie from w), (select q from w), 'asistio'),
  ((select charlie from w), (select s from w), 'asistio');

-- Una fila vàlida, amb el que cada cas hi vol canviar. Torna la sentència i no
-- l'executa: així `throws_ok` i `lives_ok` la corren amb la persona del moment.
create function pg_temp.fila(p_event uuid, p_user uuid, p_canvi jsonb default '{}')
returns text language sql as $$
  select format(
    $f$ insert into public.dades_viatger (
          event_id, user_id, nom, cognom1, cognom2, sexe, tipus_document,
          numero_document, numero_suport, nacionalitat, data_naixement,
          adreca, localitat, pais, telefon_emergencia)
        select event_id, user_id, nom, cognom1, cognom2, sexe, tipus_document,
          numero_document, numero_suport, nacionalitat, data_naixement,
          adreca, localitat, pais, telefon_emergencia
          from jsonb_populate_record(null::public.dades_viatger, %L::jsonb) $f$,
    jsonb_build_object(
      'event_id', p_event, 'user_id', p_user,
      'nom', 'Persona', 'cognom1', 'Inventada', 'cognom2', 'De Prova',
      'sexe', 'dona', 'tipus_document', 'dni', 'numero_document', '12345678Z',
      'numero_suport', 'ABC123456', 'nacionalitat', 'ES',
      'data_naixement', '2003-04-05', 'adreca', 'Via Inventada 1',
      'localitat', 'Poble Alfa', 'pais', 'ES', 'telefon_emergencia', '955000001'
    ) || p_canvi)
$$;
grant execute on function pg_temp.fila(uuid, uuid, jsonb) to authenticated;

-- ── l'estructura ───────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class where oid = 'public.dades_viatger'::regclass),
  'la taula té RLS'
);

select set_eq(
  $$ select polname::text from pg_policy where polrelid = 'public.dades_viatger'::regclass $$,
  array['dades_viatger_select_own', 'dades_viatger_insert_own',
        'dades_viatger_update_own', 'dades_viatger_delete_own'],
  'quatre polítiques, totes del propietari, i cap per a la junta'
);

select is_empty(
  $$ select polname from pg_policy
      where polrelid = 'public.dades_viatger'::regclass
        and (pg_get_expr(polqual, polrelid) ilike '%is_admin%'
             or pg_get_expr(polwithcheck, polrelid) ilike '%is_admin%') $$,
  'cap política no obre la porta a la junta'
);

select ok(
  has_table_privilege('authenticated', 'public.dades_viatger', 'SELECT')
  and has_table_privilege('authenticated', 'public.dades_viatger', 'DELETE')
  and has_column_privilege('authenticated', 'public.dades_viatger', 'numero_document', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.dades_viatger', 'user_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.dades_viatger', 'event_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.dades_viatger', 'created_at', 'INSERT')
  and not has_column_privilege('authenticated', 'public.dades_viatger', 'updated_at', 'UPDATE'),
  'el propietari escriu els camps de dades, però no a qui ni a quina casa pertanyen ni les dates'
);

select ok(
  not has_table_privilege('anon', 'public.dades_viatger', 'SELECT')
  and not has_table_privilege('anon', 'public.dades_viatger', 'INSERT'),
  'anon no hi arriba'
);

select ok(
  not has_function_privilege('authenticated', 'private.purga_dades_viatger()', 'execute'),
  'la purga no la crida ningú de fora'
);

-- ── el propietari ──────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('charlie');

select lives_ok(
  (select pg_temp.fila((select v from w), (select charlie from w))),
  'qui hi va apuntat desa les seves dades'
);

select is(
  (select numero_document || '|' || numero_suport || '|' || telefon_emergencia
     from public.dades_viatger where event_id = (select v from w)),
  '12345678Z|ABC123456|955000001',
  'i les llegeix'
);

select lives_ok(
  format($$ update public.dades_viatger set adreca = 'Via Inventada 2'
             where event_id = %L $$, (select v from w)),
  'i les edita'
);

select throws_ok(
  format($$ update public.dades_viatger set user_id = %L where event_id = %L $$,
         (select bravo from w), (select v from w)),
  '42501', null,
  'però no se les pot passar a algú altre: no hi ha grant de columna'
);

select throws_ok(
  (select pg_temp.fila((select w from w), (select charlie from w))),
  '42501', null,
  'a una casa que no les demana, no es poden desar'
);

select throws_ok(
  (select pg_temp.fila((select v from w), (select bravo from w))),
  '42501', null,
  'ni a nom d''una altra persona'
);

-- ── la validació, a la base ────────────────────────────────────────────────
--
-- El client valida el mateix abans d'enviar, i aquí és la xarxa de sota: cada
-- un d'aquests és un 23514, el CHECK de la taula, i no un 42501 de la política.
reset role;
select tests.authenticate_as('bravo');

create function pg_temp.dolenta(p_canvi jsonb) returns text language sql as $$
  select pg_temp.fila('00000000-0000-4000-8000-0000000064a1',
                      '00000000-0000-4000-8000-000000000002', p_canvi)
$$;
grant execute on function pg_temp.dolenta(jsonb) to authenticated;

select throws_ok(pg_temp.dolenta('{"numero_document": "12345678A"}'),
  '23514', null, 'un DNI amb la lletra que no toca es refusa');
select throws_ok(pg_temp.dolenta('{"numero_suport": null}'),
  '23514', null, 'un DNI sense número de suport es refusa');
select throws_ok(pg_temp.dolenta('{"tipus_document": "passaport", "numero_document": "AB1234567"}'),
  '23514', null, 'un passaport no porta número de suport');
select throws_ok(pg_temp.dolenta('{"tipus_document": "carnet"}'),
  '23514', null, 'un tipus de document fora de la llista es refusa');
select throws_ok(pg_temp.dolenta(jsonb_build_object('data_naixement', current_date + 1)),
  '23514', null, 'una data de naixement futura es refusa');
select throws_ok(pg_temp.dolenta('{"data_naixement": "1890-01-01"}'),
  '23514', null, 'i una d''abans del 1900 també');
select throws_ok(pg_temp.dolenta('{"nom": " Persona"}'),
  '23514', null, 'un nom amb un blanc al davant no és un nom net');
select throws_ok(pg_temp.dolenta('{"cognom2": ""}'),
  '23514', null, 'el segon cognom és opcional, però buit és null i no una cadena buida');
select throws_ok(pg_temp.dolenta(jsonb_build_object('adreca', repeat('a', 161))),
  '23514', null, 'una adreça massa llarga es refusa');
select throws_ok(pg_temp.dolenta(jsonb_build_object('localitat', E'Poble' || chr(10) || 'Alfa')),
  '23514', null, 'un salt de línia dins d''un camp es refusa');
select throws_ok(pg_temp.dolenta('{"nacionalitat": "Espanya"}'),
  '23514', null, 'la nacionalitat és un codi de país, no un nom');
select throws_ok(pg_temp.dolenta('{"telefon_emergencia": "truca-li"}'),
  '23514', null, 'un telèfon que no és un telèfon es refusa');

select lives_ok(
  pg_temp.dolenta('{"nom": "Persona", "cognom1": "Dos", "cognom2": null, "sexe": "altre",
                    "tipus_document": "nie", "numero_document": "X1234567L",
                    "numero_suport": "E12345678", "nacionalitat": "FR",
                    "telefon_emergencia": "+33955000003"}'),
  'un NIE amb la lletra bona i el seu suport, sense segon cognom, val'
);

-- ── un altre soci no hi arriba ─────────────────────────────────────────────
select is(
  (select count(*)::int from public.dades_viatger where user_id = (select charlie from w)),
  0,
  'bravo no llegeix les de charlie, i hi són'
);

with u as (
  update public.dades_viatger set adreca = 'Via Robada'
   where user_id = '00000000-0000-4000-8000-000000000003' returning 1)
select is((select count(*)::int from u), 0, 'ni les edita');

with d as (
  delete from public.dades_viatger
   where user_id = '00000000-0000-4000-8000-000000000003' returning 1)
select is((select count(*)::int from d), 0, 'ni les esborra');

reset role;
select is(
  (select adreca from public.dades_viatger
    where event_id = (select v from w) and user_id = (select charlie from w)),
  'Via Inventada 2',
  'i les de charlie continuen com charlie les va deixar'
);

-- Qui no hi va apuntat no en pot desar: `potser` no és apuntar-s'hi.
select tests.authenticate_as('echo');
select throws_ok(
  (select pg_temp.fila((select v from w), (select echo from w))),
  '42501', null,
  'qui ha dit potser no hi té res a desar'
);

-- La llista d'espera sí que hi és: si li toca plaça, les ha de tenir posades.
reset role;
select tests.authenticate_as('golf');
select lives_ok(
  (select pg_temp.fila((select v from w), (select golf from w))),
  'qui és a la llista d''espera sí que les pot deixar posades'
);

-- ── la junta, directament, no ──────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select count(*)::int from public.dades_viatger),
  0,
  'la junta no llegeix la taula: no té cap política'
);

select throws_ok(
  (select pg_temp.fila((select v from w), (select hotel from w))),
  '42501', null,
  'ni hi escriu per ningú'
);

-- ── la junta, per la RPC, sí ───────────────────────────────────────────────
select is(
  (select array_agg(user_id order by user_id)::text
     from public.admin_dades_viatgers((select v from w), false)),
  (select array[bravo, charlie]::text from w),
  'per la RPC veu les de qui té plaça, i no les de qui encara espera'
);

select is(
  (select numero_document || '|' || adreca || '|' || telefon_emergencia
     from public.admin_dades_viatgers((select v from w), true)
    where user_id = (select charlie from w)),
  '12345678Z|Via Inventada 2|955000001',
  'amb tots els camps'
);

select is(
  (select coalesce(array_agg(user_id), '{}')::text
     from public.admin_dades_viatgers((select w from w), false)),
  '{}',
  'd''una casa que no les demana no en surt cap'
);

select set_eq(
  $$ select user_id::text || '|' || estado || '|' || te_dades::text
       from public.admin_viatgers('00000000-0000-4000-8000-0000000064a1') $$,
  $$ values ('00000000-0000-4000-8000-000000000002|si|true'),
            ('00000000-0000-4000-8000-000000000003|si|true'),
            ('00000000-0000-4000-8000-000000000007|espera|true'),
            ('00000000-0000-4000-8000-000000000008|si|false') $$,
  'la llista diu qui hi va i qui les ha posat, sense cap dada del registre; potser no hi surt'
);

reset role;

select is(
  (select count(*)::int from public.audit_log
    where accio = 'consulta_viatgers' and target_id = (select v from w)),
  2,
  'cada consulta queda escrita, amb l''esdeveniment'
);

select is(
  (select (detall->'persones') @> to_jsonb(array[(select charlie from w)::text])
          and detall->>'exporta' = 'true'
          and actor_id = '00000000-0000-4000-8000-0000000000a1'
     from public.audit_log
    where accio = 'consulta_viatgers' and target_id = (select v from w)
      and detall->>'exporta' = 'true'),
  true,
  'qui, de qui, i si s''ha exportat'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'consulta_viatgers' and target_id = (select v from w)
      and (detall ? 'numero_document' or detall::text like '%12345678Z%')),
  0,
  'i el registre no copia cap dada: es purga als 24 mesos, no als 7 dies'
);

-- ── un soci no fa servir les RPC de la junta ───────────────────────────────
select tests.authenticate_as('charlie');

select throws_ok(
  format($$ select * from public.admin_dades_viatgers(%L, false) $$, (select v from w)),
  '42501', null, 'admin_dades_viatgers: un soci no'
);
select throws_ok(
  format($$ select * from public.admin_viatgers(%L) $$, (select v from w)),
  '42501', null, 'admin_viatgers: un soci no'
);
select throws_ok(
  format($$ select public.admin_set_demana_viatger(%L, false) $$, (select v from w)),
  '42501', null, 'admin_set_demana_viatger: un soci no'
);

-- ── deixar d'anar-hi, i donar-se de baixa ──────────────────────────────────
reset role;

update public.attendances set estado = 'no'
 where user_id = (select bravo from w) and event_id = (select v from w);

select is(
  (select count(*)::int from public.dades_viatger
    where user_id = (select bravo from w) and event_id = (select v from w)),
  0,
  'qui deixa d''anar-hi perd les dades: ja no hi ha per a què'
);

update public.profiles set estat = 'baixa' where id = (select golf from w);

select is(
  (select count(*)::int from public.dades_viatger where user_id = (select golf from w)),
  0,
  'qui es dona de baixa també'
);

-- ── el propietari les esborra quan vol ─────────────────────────────────────
insert into public.attendances (user_id, event_id, estado)
values ((select echo from w), (select w from w), 'si');
update public.events set demana_viatger = true where id = (select w from w);

select tests.authenticate_as('echo');
select lives_ok(
  (select pg_temp.fila((select w from w), (select echo from w))),
  'echo les posa a la segona casa'
);
with d as (
  delete from public.dades_viatger
   where user_id = '00000000-0000-4000-8000-000000000005' returning 1)
select is((select count(*)::int from d), 1, 'i les esborra sense demanar-ho a ningú');

-- ── l'esdeveniment deixa de demanar-les ────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.admin_set_demana_viatger(%L, true) $$, (select r from w)),
  '22023', null, 'una reunió no demana dades de viatger'
);

select is(
  public.admin_set_demana_viatger((select v from w), false),
  1,
  'treure la casella diu quantes en s''esborren'
);

reset role;

select is(
  (select count(*)::int from public.dades_viatger where event_id = (select v from w)),
  0,
  'i se''n van totes'
);

select is(
  (select detall->>'esborrades' || '|' || (detall->>'de') || '|' || (detall->>'a')
     from public.audit_log
    where accio = 'set_demana_viatger' and target_id = (select v from w)),
  '1|true|false',
  'i queda escrit, amb quantes'
);

-- ── set dies després del final, se'n van soles ─────────────────────────────
--
-- Les de P, Q i S es posen com a postgres: la finestra ja no deixa escriure-hi
-- a ningú (P i S), i el que es prova aquí és la purga, no la porta.
insert into public.dades_viatger (
  event_id, user_id, nom, cognom1, sexe, tipus_document, numero_document,
  numero_suport, nacionalitat, data_naixement, adreca, localitat, pais,
  telefon_emergencia)
select e, (select charlie from w), 'Persona', 'Inventada', 'dona', 'dni', '12345678Z',
       'ABC123456', 'ES', date '2003-04-05', 'Via Inventada 1', 'Poble Alfa', 'ES',
       '955000001'
  from unnest(array[(select p from w), (select q from w), (select s from w)]) e;

select is(
  private.viatger_caduca((select q from w)),
  (select ends_at + interval '7 days' from public.event_details where event_id = (select q from w)),
  'caduquen set dies després del final, no de l''inici'
);

select is(
  private.viatger_caduca((select s from w)),
  (select starts_at + interval '6 hours' + interval '7 days' from public.events where id = (select s from w)),
  'i sense final, amb les sis hores de `src/lib/eventEnd.ts`'
);

select tests.authenticate_as('charlie');
select is(
  (select count(*)::int from public.dades_viatger where event_id = (select q from w)),
  1,
  'el propietari encara veu les de Q'
);
select throws_ok(
  format($$ update public.dades_viatger set adreca = 'Via Tarda' where event_id = %L $$,
         (select p from w)),
  '42501', null,
  'però les de P ja no les pot tocar: la finestra s''ha tancat'
);
reset role;

select is(private.purga_dades_viatger(), 2, 'la purga n''esborra dues');

select set_eq(
  $$ select event_id::text from public.dades_viatger
      where user_id = '00000000-0000-4000-8000-000000000003' $$,
  array['00000000-0000-4000-8000-0000000064a4'],
  'les de P i S se n''han anat; les de Q, que van acabar fa sis dies, es queden'
);

select is(
  (select schedule from cron.job where jobname = 'purga-dades-viatger'),
  '17 * * * *',
  'i la purga corre cada hora, no cada nit: set dies volen dir set dies'
);

-- ── esborrar l'esdeveniment ────────────────────────────────────────────────
delete from public.events where id = (select q from w);

select is(
  (select count(*)::int from public.dades_viatger where event_id = (select q from w)),
  0,
  'si s''esborra l''esdeveniment, les dades se''n van amb ell'
);

select * from finish();
rollback;

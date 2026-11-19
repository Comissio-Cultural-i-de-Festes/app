-- El resum de les assistències diu el mateix que les files que el client
-- llegia, per a cada mena de persona que obre l'Inici.
--
-- DUES MENES D'ASSERCIÓ, I CALEN TOTES DUES. Les que comparen la funció amb la
-- consulta del client —les files d'`attendances` amb el perfil al costat,
-- llegides com la persona— diuen «el mateix que abans»; però com que totes dues
-- passen per la RLS, si la funció es tornés `definer` totes dues podrien
-- equivocar-se igual en alguns casos. Les de valors escrits a mà —el pendent
-- que només es veu a ell, la reunió de junta que un soci no compta, la cara
-- sense foto d'una baixa— són les que fallarien llavors.
--
-- Els esdeveniments: un amb places, un sense, un de passat amb fitxats, una
-- reunió de junta i un esborrany. Les persones i els ids són nous i inventats.

begin;
select plan(28);

reset role;

select tests.create_user('res_junta', '00000000-0000-4000-8000-000000f50001', 'admin',  'actiu');
select tests.create_user('res_soci',  '00000000-0000-4000-8000-000000f50002', 'member', 'actiu');
select tests.create_user('res_pend',  '00000000-0000-4000-8000-000000f50003', 'member', 'pendent');
select tests.create_user('res_baixa', '00000000-0000-4000-8000-000000f50004', 'member', 'baixa');
select tests.create_user('res_a',     '00000000-0000-4000-8000-000000f5000a', 'member', 'actiu');
select tests.create_user('res_b',     '00000000-0000-4000-8000-000000f5000b', 'member', 'actiu');
select tests.create_user('res_c',     '00000000-0000-4000-8000-000000f5000c', 'member', 'actiu');
select tests.create_user('res_d',     '00000000-0000-4000-8000-000000f5000d', 'member', 'actiu');
select tests.create_user('res_e',     '00000000-0000-4000-8000-000000f5000e', 'member', 'actiu');
select tests.create_user('res_f',     '00000000-0000-4000-8000-000000f5000f', 'member', 'actiu');
-- Una baixa que havia dit que sí: la seva fila es compta, la seva cara no.
select tests.create_user('res_x',     '00000000-0000-4000-8000-000000f50010', 'member', 'baixa');

update public.profiles
   set avatar_url = id::text || '/1.jpg'
 where id::text like '00000000-0000-4000-8000-000000f500%';

insert into public.events (id, tipo, abast, starts_at, plazas, puntos, published)
values
  -- Amb places, d'aquí a tres dies.
  ('00000000-0000-4000-8000-000000f5e001', 'fiesta', 'comi', now() + interval '3 days', 10, 10, true),
  -- Sense places, i amb més gent que cares.
  ('00000000-0000-4000-8000-000000f5e002', 'fiesta', 'comi', now() + interval '5 days', null, 10, true),
  -- Ja ha passat: hi ha fitxats.
  ('00000000-0000-4000-8000-000000f5e003', 'fiesta', 'comi', now() - interval '10 days', 20, 10, true),
  -- Reunió de junta: un soci no hi compta ningú.
  ('00000000-0000-4000-8000-000000f5e004', 'reunio', 'junta', now() + interval '2 days', null, 0, true),
  -- Esborrany: la llista pública no hi arriba.
  ('00000000-0000-4000-8000-000000f5e005', 'fiesta', 'comi', now() + interval '9 days', 30, 10, false);

insert into public.event_title (event_id, titulo)
values
  ('00000000-0000-4000-8000-000000f5e001', 'Resum amb places'),
  ('00000000-0000-4000-8000-000000f5e002', 'Resum sense places'),
  ('00000000-0000-4000-8000-000000f5e003', 'Resum passat'),
  ('00000000-0000-4000-8000-000000f5e004', 'Resum de junta'),
  ('00000000-0000-4000-8000-000000f5e005', 'Resum esborrany')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.attendances (user_id, event_id, estado, created_at)
values
  -- E1: tres sí d'avui (un de la baixa), un del pendent, un de fa dos dies;
  -- un potser, un no i una espera que no es compten; el meu potser.
  (tests.uid('res_x'),     '00000000-0000-4000-8000-000000f5e001', 'si',      now() - interval '30 minutes'),
  (tests.uid('res_a'),     '00000000-0000-4000-8000-000000f5e001', 'si',      now() - interval '1 hour'),
  (tests.uid('res_b'),     '00000000-0000-4000-8000-000000f5e001', 'si',      now() - interval '2 hours'),
  (tests.uid('res_pend'),  '00000000-0000-4000-8000-000000f5e001', 'si',      now() - interval '5 hours'),
  (tests.uid('res_f'),     '00000000-0000-4000-8000-000000f5e001', 'si',      now() - interval '40 hours'),
  (tests.uid('res_c'),     '00000000-0000-4000-8000-000000f5e001', 'potser',  now() - interval '3 hours'),
  (tests.uid('res_d'),     '00000000-0000-4000-8000-000000f5e001', 'no',      now() - interval '3 hours'),
  (tests.uid('res_e'),     '00000000-0000-4000-8000-000000f5e001', 'espera',  now() - interval '3 hours'),
  (tests.uid('res_soci'),  '00000000-0000-4000-8000-000000f5e001', 'potser',  now() - interval '3 days'),
  -- E2: set sí, el meu el més nou.
  (tests.uid('res_soci'),  '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '10 minutes'),
  (tests.uid('res_a'),     '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '1 hour'),
  (tests.uid('res_b'),     '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '2 hours'),
  (tests.uid('res_c'),     '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '3 hours'),
  (tests.uid('res_d'),     '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '4 hours'),
  (tests.uid('res_e'),     '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '5 hours'),
  (tests.uid('res_f'),     '00000000-0000-4000-8000-000000f5e002', 'si',      now() - interval '6 hours'),
  -- E3: tres fitxats (jo també), un sí que no va venir, un no.
  (tests.uid('res_a'),     '00000000-0000-4000-8000-000000f5e003', 'asistio', now() - interval '12 days'),
  (tests.uid('res_b'),     '00000000-0000-4000-8000-000000f5e003', 'asistio', now() - interval '12 days'),
  (tests.uid('res_soci'),  '00000000-0000-4000-8000-000000f5e003', 'asistio', now() - interval '11 days'),
  (tests.uid('res_c'),     '00000000-0000-4000-8000-000000f5e003', 'si',      now() - interval '11 days'),
  (tests.uid('res_d'),     '00000000-0000-4000-8000-000000f5e003', 'no',      now() - interval '11 days'),
  -- E4 i E5: un sí cadascun.
  (tests.uid('res_junta'), '00000000-0000-4000-8000-000000f5e004', 'si',      now() - interval '1 hour'),
  (tests.uid('res_a'),     '00000000-0000-4000-8000-000000f5e005', 'si',      now() - interval '1 hour');

-- La consulta que feia el client, agregada igual que la pantalla: les files que
-- la persona pot llegir, amb el perfil que pot llegir al costat.
-- `security_invoker`: una vista temporal és de postgres, i sense això les dues
-- llegirien saltant-se la RLS i la comparació no diria res.
create temp view client_ho_veu with (security_invoker = true) as
with ids(event_id) as (
  values ('00000000-0000-4000-8000-000000f5e001'::uuid),
         ('00000000-0000-4000-8000-000000f5e002'::uuid),
         ('00000000-0000-4000-8000-000000f5e003'::uuid),
         ('00000000-0000-4000-8000-000000f5e004'::uuid),
         ('00000000-0000-4000-8000-000000f5e005'::uuid)
),
files as (
  select a.event_id, a.user_id, a.estado, a.created_at, p.nombre, p.avatar_url
    from public.attendances a
    left join public.profiles p on p.id = a.user_id
   where a.event_id in (select event_id from ids)
)
select i.event_id,
       (select count(*)::int from files f
         where f.event_id = i.event_id and f.estado in ('si', 'asistio')) as going,
       (select count(*)::int from files f
         where f.event_id = i.event_id and f.estado = 'asistio') as attended,
       (select f.estado from files f
         where f.event_id = i.event_id and f.user_id = auth.uid()) as mine,
       (select coalesce(array_agg(g.user_id order by g.created_at desc, g.user_id), '{}')
          from (select f.user_id, f.created_at from files f
                 where f.event_id = i.event_id and f.estado in ('si', 'asistio')
                 order by f.created_at desc, f.user_id limit 5) g) as cares,
       (select coalesce(array_agg(g.nombre order by g.created_at desc, g.user_id), '{}')
          from (select f.nombre, f.created_at, f.user_id from files f
                 where f.event_id = i.event_id and f.estado in ('si', 'asistio')
                   and f.user_id <> auth.uid() and f.nombre is not null and f.nombre <> ''
                   and f.created_at >= now() - interval '26 hours'
                 order by f.created_at desc, f.user_id limit 2) g) as noms,
       (select count(*)::int from files f
         where f.event_id = i.event_id and f.estado in ('si', 'asistio')
           and f.user_id <> auth.uid() and f.nombre is not null and f.nombre <> ''
           and f.created_at >= now() - interval '26 hours') as total
  from ids i;
grant select on client_ho_veu to authenticated;

create temp view el_resum with (security_invoker = true) as
select r.event_id, r.going, r.attended, r.mine,
       array(select (c ->> 'user_id')::uuid from jsonb_array_elements(r.faces) c) as cares,
       r.recent as noms,
       r.recent_total as total
  from public.resum_assistencies(array[
         '00000000-0000-4000-8000-000000f5e001',
         '00000000-0000-4000-8000-000000f5e002',
         '00000000-0000-4000-8000-000000f5e003',
         '00000000-0000-4000-8000-000000f5e004',
         '00000000-0000-4000-8000-000000f5e005'
       ]::uuid[], now() - interval '26 hours') r;
grant select on el_resum to authenticated;

-- ── la forma ────────────────────────────────────────────────────────────────

select is(
  (select prosecdef from pg_proc where oid = 'public.resum_assistencies(uuid[], timestamptz)'::regprocedure),
  false,
  'és security invoker: les polítiques decideixen, no una còpia de les polítiques'
);

select ok(
  not has_function_privilege('anon', 'public.resum_assistencies(uuid[], timestamptz)', 'execute'),
  'anon no la pot cridar'
);

-- ── soci actiu ──────────────────────────────────────────────────────────────

select tests.authenticate_as('res_soci');

-- Els ids van escrits: `tests.*` no és d'`authenticated`.
select set_eq(
  $$ select * from el_resum $$,
  $$ select * from client_ho_veu $$,
  'soci actiu: el resum és el que el client comptava amb les files'
);

select results_eq(
  $$ select going, attended, mine from el_resum order by event_id $$,
  $$ values (5, 0, 'potser'::text), (7, 0, 'si'), (4, 3, 'asistio'), (0, 0, null), (0, 0, null) $$,
  'soci actiu: sí de tothom, el meu potser, cap reunió de junta ni esborrany'
);

select is(
  (select cares from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001'),
  array['00000000-0000-4000-8000-000000f50010'::uuid, '00000000-0000-4000-8000-000000f5000a'::uuid, '00000000-0000-4000-8000-000000f5000b'::uuid, '00000000-0000-4000-8000-000000f50003'::uuid, '00000000-0000-4000-8000-000000f5000f'::uuid],
  'soci actiu: les cares, de la més nova a la més vella'
);

select is(
  (select array_agg(c ->> 'avatar_url' order by ord)
     from public.resum_assistencies(array['00000000-0000-4000-8000-000000f5e001']::uuid[], now() - interval '26 hours') r,
          jsonb_array_elements(r.faces) with ordinality as e(c, ord)),
  array[null, '00000000-0000-4000-8000-000000f5000a'::uuid || '/1.jpg', '00000000-0000-4000-8000-000000f5000b'::uuid || '/1.jpg', null, '00000000-0000-4000-8000-000000f5000f'::uuid || '/1.jpg'],
  'soci actiu: la baixa i el pendent hi són sense foto, com amb el perfil incrustat'
);

select results_eq(
  $$ select noms, total from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001' $$,
  $$ values (array['Res_a', 'Res_b'], 2) $$,
  'soci actiu: els noms des de p_desde, sense els perfils que no veu ni el de fa dos dies'
);

select results_eq(
  $$ select recent, recent_total
       from public.resum_assistencies(array['00000000-0000-4000-8000-000000f5e001']::uuid[],
                                      now() - interval '90 minutes') $$,
  $$ values (array['Res_a'], 1) $$,
  'soci actiu: p_desde és el que talla: d''una hora i mitja ençà només n''hi ha un'
);

select is(
  (select cares from el_resum where event_id = '00000000-0000-4000-8000-000000f5e002'),
  array['00000000-0000-4000-8000-000000f50002'::uuid, '00000000-0000-4000-8000-000000f5000a'::uuid, '00000000-0000-4000-8000-000000f5000b'::uuid, '00000000-0000-4000-8000-000000f5000c'::uuid, '00000000-0000-4000-8000-000000f5000d'::uuid],
  'soci actiu: cinc cares de set, la meva primer perquè és la més nova'
);

select ok(
  not exists (
    select 1 from el_resum where event_id = '00000000-0000-4000-8000-000000f5e002'
       and 'Res_soci' = any (noms)
  ),
  'soci actiu: el meu nom no surt a «s''hi han apuntat avui»'
);

select is(
  (select r.mine_at
     from public.resum_assistencies(array['00000000-0000-4000-8000-000000f5e001']::uuid[], now() - interval '26 hours') r),
  (select created_at from public.attendances
    where event_id = '00000000-0000-4000-8000-000000f5e001' and user_id = '00000000-0000-4000-8000-000000f50002'::uuid),
  'soci actiu: quan vaig contestar, per posar la meva cara al seu lloc'
);

select is(
  (select count(*)::int from public.resum_assistencies(array[
     '00000000-0000-4000-8000-000000f5e001',
     '00000000-0000-4000-8000-000000f5e001',
     '00000000-0000-4000-8000-000000f5e999'
   ]::uuid[], now() - interval '26 hours')),
  2,
  'una fila per id: els repetits un cop, i un que no existeix també, a zero'
);

select results_eq(
  $$ select going, attended, mine, faces, recent_total, recent
       from public.resum_assistencies(array['00000000-0000-4000-8000-000000f5e999']::uuid[], now() - interval '26 hours') $$,
  $$ values (0, 0, null::text, '[]'::jsonb, 0, '{}'::text[]) $$,
  'un esdeveniment sense res és zero i llistes buides, no null'
);

select ok(
  not exists (
    select 1
      from public.resum_assistencies(array['00000000-0000-4000-8000-000000f5e001']::uuid[], now() - interval '26 hours') r,
           jsonb_array_elements(r.faces) c
     where c ?| array['nombre', 'email', 'telefon', 'escola']
  ),
  'una cara és id, foto i hora: cap altra dada'
);

select throws_ok(
  $$ select * from public.resum_assistencies(
       array(select gen_random_uuid() from generate_series(1, 51)), now()) $$,
  '22023',
  null,
  'més de cinquanta esdeveniments és un error de qui crida'
);

select lives_ok(
  $$ select * from public.resum_assistencies(
       array(select gen_random_uuid() from generate_series(1, 50)), now()) $$,
  'cinquanta sí'
);

-- ── pendent ─────────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('res_pend');

select set_eq(
  $$ select * from el_resum $$,
  $$ select * from client_ho_veu $$,
  'pendent: el resum és el que el client comptava amb les files'
);

select results_eq(
  $$ select going, attended, mine from el_resum order by event_id $$,
  $$ values (1, 0, 'si'::text), (0, 0, null), (0, 0, null), (0, 0, null), (0, 0, null) $$,
  'pendent: només la seva pròpia fila, cap recompte dels altres'
);

select is(
  (select cares from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001'),
  array['00000000-0000-4000-8000-000000f50003'::uuid],
  'pendent: cap cara dels altres'
);

select ok(
  (select bool_and(cardinality(noms) = 0) from el_resum),
  'pendent: cap nom dels altres'
);

-- ── junta ───────────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('res_junta');

select set_eq(
  $$ select * from el_resum $$,
  $$ select * from client_ho_veu $$,
  'junta: el resum és el que el client comptava amb les files'
);

select results_eq(
  $$ select going, attended, mine from el_resum order by event_id $$,
  $$ values (5, 0, null::text), (7, 0, null), (4, 3, null), (1, 0, 'si'), (1, 0, null) $$,
  'junta: també la reunió de junta i l''esborrany'
);

select results_eq(
  $$ select noms, total from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001' $$,
  $$ values (array['Res_x', 'Res_a'], 4) $$,
  'junta: veu els noms dels perfils que un soci no veu, i només els dos més nous'
);

-- ── baixa ───────────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('res_baixa');

select set_eq(
  $$ select * from el_resum $$,
  $$ select * from client_ho_veu $$,
  'baixa: el resum és el que el client comptava amb les files'
);

select results_eq(
  $$ select going, attended, mine, cardinality(cares), cardinality(noms) from el_resum order by event_id $$,
  $$ values (0, 0, null::text, 0, 0), (0, 0, null, 0, 0), (0, 0, null, 0, 0), (0, 0, null, 0, 0), (0, 0, null, 0, 0) $$,
  'baixa: res de ningú'
);

-- La baixa que havia dit que sí: la seva pròpia fila, i prou.
reset role;
select tests.authenticate_as('res_x');

select results_eq(
  $$ select going, mine from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001' $$,
  $$ values (1, 'si'::text) $$,
  'una baixa amb resposta es veu a ella sola'
);

-- ── el que escriu una resposta es veu a l'instant ──────────────────────────

reset role;
select tests.authenticate_as('res_soci');
select public.set_attendance('00000000-0000-4000-8000-000000f5e001', 'si');

select results_eq(
  $$ select going, mine from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001' $$,
  $$ values (6, 'si'::text) $$,
  'el meu sí suma un i canvia la meva resposta'
);

select is(
  array_position(
    (select cares from el_resum where event_id = '00000000-0000-4000-8000-000000f5e001'),
    '00000000-0000-4000-8000-000000f50002'::uuid),
  null,
  'i la meva cara va pel dia que vaig contestar el primer cop: no salta al davant'
);

select * from finish();
rollback;

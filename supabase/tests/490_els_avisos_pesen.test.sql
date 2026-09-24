-- La normativa dels avisos: tres pesos i tres escalons, i cap llindar únic.
--
-- El que es fixa aquí és que les sis files existeixen amb els valors acordats,
-- que el llindar de la 73 ja no hi és —una fila editable que ningú no llegeix és
-- el defecte que aquell llindar va tenir una setmana— i que la junta les mou pel
-- mateix camí auditat que la resta del barem. Com es LLEGEIXEN (de dalt a baix,
-- zero apaga) és cosa d'`estatDe()` al client i té la seva prova allà.

begin;
select plan(9);

reset role;

select is(
  (select jsonb_object_agg(clau, punts) from public.point_values
    where mena = 'avisos' and clau like 'pes\_%'),
  '{"pes_lleu": 1, "pes_greu": 2, "pes_molt_greu": 4}'::jsonb,
  'els pesos de fàbrica: lleu 1, greu 2, molt greu 4'
);

select is(
  (select jsonb_object_agg(clau, punts) from public.point_values
    where mena = 'avisos' and clau like 'llindar\_%'),
  '{"llindar_avis": 2, "llindar_risc": 4, "llindar_expulsio": 6}'::jsonb,
  'els escalons de fàbrica: avís 2, risc 4, expulsió 6'
);

select is(
  (select count(*)::int from public.point_values where mena = 'avisos' and clau = 'llindar'),
  0,
  'el llindar únic de la 73 ja no hi és'
);

select is(
  (select array_agg(clau order by ordre) from public.point_values where mena = 'avisos'),
  array['pes_lleu', 'pes_greu', 'pes_molt_greu',
        'llindar_avis', 'llindar_risc', 'llindar_expulsio', 'sostre_curs'],
  'i surten en ordre: els pesos, els escalons i el sostre al final'
);

-- ── qui els mou ─────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_set_point_value('avisos', 'llindar_risc', 3) $$,
  '42501',
  'nomes junta',
  'un soci no mou cap escaló'
);

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  $$ select public.admin_set_point_value('avisos', 'llindar_risc', 0) $$,
  'la junta pot apagar un escaló posant-lo a zero'
);

select throws_ok(
  $$ select public.admin_set_point_value('avisos', 'pes_molt_greu', 501) $$,
  '22023',
  null,
  'i el rang del barem val també per als pesos'
);

select throws_ok(
  $$ select public.admin_set_point_value('avisos', 'llindar', 4) $$,
  'P0002',
  null,
  'el llindar vell ja no es pot desar: la fila no existeix'
);

reset role;
select is(
  (select detall->>'clau' || '=' || (detall->>'ara')
     from public.audit_log
    where accio = 'set_point_value'
      and created_at >= transaction_timestamp()
      and detall->>'mena' = 'avisos'),
  'llindar_risc=0',
  'i el canvi queda al registre com qualsevol altre número del barem'
);

select * from finish();
rollback;

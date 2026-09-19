-- Un avís posat un curs i retirat el següent compta al curs de l'avís, i el
-- panell ho diu igual que el sostre.
--
-- PER QUÈ NO N'HI HA PROU AMB EL 488. Aquell prova la garantia de fora: que
-- cap fila d'avís no arribi mai a ser una barra del gràfic. La compleix el
-- `least(..., 0)` de la migració 82 tot sol, i per tant el 488 passaria encara
-- que l'altra meitat de la 82 —l'ancoratge de les dues files a la data de
-- l'avís— no hi fos. Aquest fitxer prova aquella meitat, i és la que decideix
-- quin número veu la junta.
--
-- EL CAS. Un avís de −25 posat al curs 2027-28 i retirat al 2028-29, amb la
-- seva fila a `avisos` apuntant a les dues files de punts, que és exactament el
-- que `avisa()` i `retira_avis()` deixen escrit. Les dues cares del mateix
-- avís, en dos cursos.
--
-- QUÈ HA DE DIR EL PANELL. Al curs de l'AVÍS: la fila `avis` hi és, diu que
-- n'hi ha hagut un i diu que ha costat 0 —es va posar i es va tornar—. Al curs
-- de la RETIRADA: res, perquè allà no ha passat cap avís.
--
-- SENSE L'ANCORATGE, amb el `least` sol, el curs de l'avís diria −25 per sempre
-- encara que aquells punts ja s'haguessin tornat, i el de la retirada es
-- quedaria buit igualment perquè el `least` li menja el +25. O sigui: un càstig
-- que ja no existeix, cobrat eternament al curs on es va posar, i la devolució
-- enlloc. És la mateixa mentida del 488 amb el signe canviat, i la 78 ja va
-- haver de resoldre-la per al sostre del curs. Les dues lectures d'avisos del
-- repositori han de comptar igual.
--
-- Persones i esdeveniments inventats, com a tot el repositori. Les finestres
-- són al futur i diferents de les del 488 a posta: l'stack local és compartit i
-- així cap fila de ningú més hi pot caure, ni les d'aquell fitxer.

begin;
select plan(4);

reset role;

-- L'avís, la seva retirada, i la fila d'`avisos` que els aparella.
insert into public.points_log (id, user_id, event_id, motivo, puntos, nota, granted_by, created_at)
values
  ('00000000-0000-4000-8000-00000000f001',
   '00000000-0000-4000-8000-000000000003', null, 'avis', -25,
   'va marxar amb les claus a la butxaca',
   '00000000-0000-4000-8000-0000000000a1', '2031-02-14T21:00:00Z'),
  ('00000000-0000-4000-8000-00000000f002',
   '00000000-0000-4000-8000-000000000003', null, 'avis_retirat', 25,
   'les claus eren en un altre clauer, ens vam equivocar',
   '00000000-0000-4000-8000-0000000000a1', '2031-12-02T19:00:00Z');

insert into public.avisos (
  user_id, tipus, gravetat, nota, points_log_id,
  created_by, created_at, retirat_at, retirat_by, retirat_nota, retirat_points_log_id)
values (
  '00000000-0000-4000-8000-000000000003', 'va_deixar_ho', 2,
  'va marxar amb les claus a la butxaca',
  '00000000-0000-4000-8000-00000000f001',
  '00000000-0000-4000-8000-0000000000a1', '2031-02-14T21:00:00Z',
  '2031-12-02T19:00:00Z', '00000000-0000-4000-8000-0000000000a1',
  'les claus eren en un altre clauer, ens vam equivocar',
  '00000000-0000-4000-8000-00000000f002');

reset role;
select tests.authenticate_as('junta_alfa');

create temp table curs_de_l_avis as
select jsonb_array_elements(
         public.admin_dashboard('2030-09-01T00:00:00Z', '2031-07-01T00:00:00Z')
         -> 'punts_per_motiu') as r;
grant select on curs_de_l_avis to authenticated;

create temp table curs_de_la_retirada as
select jsonb_array_elements(
         public.admin_dashboard('2031-09-01T00:00:00Z', '2032-07-01T00:00:00Z')
         -> 'punts_per_motiu') as r;
grant select on curs_de_la_retirada to authenticated;

-- ── el curs on es va posar l'avís ───────────────────────────────────────────

-- Hi és: una sanció que ha passat és informació, i la 80 la va treure de
-- l'amagatall a posta.
select is(
  (select count(*)::int from curs_de_l_avis where r->>'motivo' = 'avis'),
  1,
  'al curs de l''avís la fila `avis` hi és'
);

-- I val zero, que és el que va acabar costant. Aquesta és l'asserció que cau
-- sense l'ancoratge: la compensatòria és de l'any següent i, comptada pel seu
-- propi dia, no arriba mai a aquesta finestra.
select is(
  (select (r->>'punts')::int from curs_de_l_avis where r->>'motivo' = 'avis'),
  0,
  'i diu 0: l''avís es va posar i es va tornar, encara que la devolució sigui de l''any següent'
);

-- El número que acompanya el zero. Sense ell, «0» no es distingeix de «no ha
-- passat res», que són dues coses diferents i la migració 80 va escriure un
-- paràgraf sencer per dir-ho.
select is(
  (select (r->>'vegades')::int from curs_de_l_avis where r->>'motivo' = 'avis'),
  1,
  'i que n''hi va haver un, que és el que fa que el zero es pugui llegir'
);

-- ── i el curs on es va retirar ──────────────────────────────────────────────

select is(
  (select count(*)::int from curs_de_la_retirada where r->>'motivo' = 'avis'),
  0,
  'al curs de la retirada no hi surt cap avís, perquè allà no n''hi ha hagut cap'
);

-- ── ON VA ANAR L'ARREGLAMENT ────────────────────────────────────────────────
--
-- A `admin_dashboard`, al bloc `v_motius`, per la migració 82: les files amb
-- motiu `avis` i `avis_retirat` es filtren per la data de l'avís que les
-- explica —`avisos.points_log_id` i `avisos.retirat_points_log_id`— i no per la
-- seva pròpia. És la regla que la 78 ja havia escrit per al sostre del curs, i
-- ara les dues lectures d'avisos del repositori compten igual.

select * from finish();
rollback;

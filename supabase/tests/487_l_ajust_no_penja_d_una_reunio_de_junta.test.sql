-- La llista «De quina nit» ofereix una reunió de junta, i la base la refusa.
--
-- ON VA LA CORRECCIÓ: a `fetchAjustEvents`
-- (`src/features/junta/memberPointsApi.ts`), que consulta `events_public` amb
-- `starts_at <= now()` i res més. Hi falta `.neq('abast', 'junta')` —la vista
-- ja porta la columna `abast`, o sigui que no cal cap migració.
--
-- EL FORAT. `private.no_points_from_junta_meetings()`, disparador BEFORE INSERT
-- de `points_log` des de la 48, refusa amb 22023 qualsevol fila el
-- `event_id` de la qual sigui un esdeveniment amb `abast = 'junta'`. La llista
-- del formulari d'ajust decideix a posta no excloure les reunions —el seu
-- comentari diu «SENSE EXCLOURE LES REUNIONS… aquí sí que s'hi pot haver fet
-- una cosa que valgui punts»— i la decisió és bona, però està presa sobre
-- l'eix equivocat: el que el disparador mira no és `tipo = 'reunio'` sinó
-- `abast = 'junta'`. «Assemblea de setembre» és una reunió i s'hi pot penjar
-- un ajust; «Junta de dimarts» és una reunió de junta i no.
--
-- QUÈ VEU QUI HO FA. La primera opció de la llista, just sota «De cap en
-- concret», és la reunió de junta. En desar, el 22023 arriba a `errorKey` com
-- a classe 22 i es tradueix a «errors.generic»: «No ha sortit bé. Torna-ho a
-- provar d'aquí un moment.» —un consell que no pot funcionar mai, perquè
-- tornar-hi tornarà a fallar. Els punts no s'escriuen i el formulari es queda
-- ple sense dir què s'ha de canviar.
--
-- LES DUES ASSERCIONS. La primera PASSA i escriu la regla; la segona FALLA i
-- és el forat. Quan `fetchAjustEvents` filtri, la segona ha de passar.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(2);

reset role;
select tests.authenticate_as('junta_alfa');

-- La regla, tal com és avui.
select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       (select e.id from public.events e
         where e.abast = 'junta' and e.starts_at <= now()
         order by e.starts_at desc limit 1),
       'manual', 20, 'un ajust penjat de la reunio de junta') $$,
  '22023',
  'una reunio de junta no reparteix punts',
  'la base refusa un ajust penjat d''una reunio de junta'
);

-- I la llista que el formulari dibuixa, que és exactament aquesta consulta.
reset role;
select is_empty(
  $$ select id from public.events_public
      where starts_at <= now()
        and abast = 'junta'
      order by starts_at desc
      limit 25 $$,
  'la llista «De quina nit» no ofereix cap reunio de junta'
);

select * from finish();
rollback;

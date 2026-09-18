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
-- LES DUES ASSERCIONS, I PER QUÈ LA SEGONA NO ÉS LA QUE ES VA ESCRIURE PRIMER.
-- La primera escriu la regla: la base refusa l'ajust. La segona, tal com va
-- néixer, afirmava que `events_public` no havia de servir CAP esdeveniment amb
-- `abast = 'junta'`, i això no es pot demanar: `/junta/reunions` llegeix
-- aquesta mateixa vista per dibuixar les reunions (`meetingsApi.ts`), i
-- `tests/rls/policies.test.ts`, cas «and the junta sees all of it», afirma que
-- la junta SÍ que hi ha de veure la reunió. Buidar-la trencaria les dues coses.
--
-- La correcció va al client —`.neq('abast', 'junta')` a `fetchAjustEvents`— i
-- una consulta de client no es pot provar des d'aquí. Qui la prova és
-- `tests/rls/junta_ajust.test.ts`, que la fa per Kong amb un token de debò i
-- porta els tres casos junts: que sense el filtre la vista sí que la serviria,
-- que amb el filtre no, i que si s'hi pengés un ajust la base el refusaria.
--
-- El que sí que pertoca a aquest fitxer és la tanca de l'altra banda: que
-- ningú no «arregli» això buidant la vista. Per això la segona asserció afirma
-- el contrari del que afirmava, i amb la raó escrita al costat.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(2);

-- LA REUNIÓ SE LA FA AQUEST FITXER I NO LA DEMANA A LA LLAVOR. L'única reunió
-- de junta sembrada («Junta de dimarts») és `now() + 2 days`, i les dues
-- assercions parlen de la llista del formulari, que només ofereix el que ja ha
-- passat. Demanar-la a la llavor feia passar el fitxer en una base on algú
-- n'hagués creat una de passada des de la pantalla, i caure en una de nova
-- —que és el que fa la integració contínua a cada execució.
reset role;
insert into public.events (id, tipo, abast, starts_at, plazas, precio_cents, puntos, published, created_by)
values ('00000000-0000-4000-8000-0000000000f7', 'reunio', 'junta',
        now() - interval '2 days', null, 0, 0, true,
        '00000000-0000-4000-8000-0000000000a1');
insert into public.event_title (event_id, titulo)
values ('00000000-0000-4000-8000-0000000000f7', 'Junta inventada de fa dos dies');

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

-- I la tanca de l'altra banda: la vista ha de CONTINUAR servint-les, que és
-- d'on `/junta/reunions` les treu. Si això es buida, el filtre del client
-- sobra i mitja pantalla de la junta es queda sense reunions.
reset role;
select isnt_empty(
  $$ select id from public.events_public
      where starts_at <= now()
        and abast = 'junta'
      order by starts_at desc
      limit 25 $$,
  'la vista continua servint les reunions de junta: qui les treu es el client'
);

select * from finish();
rollback;

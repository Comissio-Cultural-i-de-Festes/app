-- El perfil d'un soci, des de dins de la base.
--
-- QUATRE COSES QUE AQUEST FITXER FIXA, i cap d'elles es veu des d'una pantalla
-- fins al dia que es trenca.
--
-- La primera, i la que justifica el fitxer sencer: `member_badges()` NO
-- REPARTEIX INSÍGNIES. `my_badges()` sí, a posta, i és el que la fa
-- retroactiva; una versió per a una altra persona que ho fes voldria dir que
-- obrir el perfil d'algú li regala insígnies i que qui les guanya depèn de qui
-- el mira. Aquí es comprova de les dues maneres: que cridar-la no crea cap
-- fila, i que està declarada `stable` —que és el que faria petar un
-- `grant_badges()` afegit algun dia per distracció, en comptes de deixar-lo
-- passar.
--
-- La segona: la ratxa que veu un altre és EXACTAMENT la que veus tu. El bucle
-- va baixar a `private.streak_of()` amb la migració 75 precisament per això, i
-- la comprovació compara les dues respostes objecte contra objecte en comptes
-- de camp a camp: un camp nou que només arribés a una de les dues portes
-- passaria desapercebut a qualsevol comparació escrita a mà.
--
-- La tercera: qui ja no és soci no té perfil. Zero files i null, no un error —
-- la capçalera de la pantalla ja ho diu una vegada.
--
-- La quarta: el títol d'una activitat que encara no s'ha revelat NO surt.
-- Gairebé totes les insígnies venen d'una activitat a què la persona va anar, i
-- allò fa temps que està revelat; `va_ser_idea_meva` no, que apunta a
-- l'esdeveniment d'una proposta acceptada i pot ser una festa d'aquí a un mes.
--
-- CADA REFÚS PORTA EL SEU CONTROL POSITIU, com demana el capçal de la 370: una
-- prova que només comprova que una cosa peta passaria igual el dia que peti
-- sempre, i un `is_empty` sobre una taula buida passa per sempre.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(31);

reset role;

-- El calendari, buit. Una ratxa es compta sobre TOTES les activitats passades,
-- o sigui que qualsevol festa del seed hi entraria i el número canviaria cada
-- cop que algú toqui les dades de demostració.
-- El registre de punts va primer: `points_log.event_id` és `on delete set
-- null`, i aquest UPDATE el para el disparador d'append-only.
delete from public.points_log;
delete from public.events;

-- ── gent nova, per no heretar res del seed ─────────────────────────────────
select tests.create_user('perfil_mirat', '00000000-0000-4000-8000-00000000d001', 'member', 'actiu', 'politecnica');
select tests.create_user('perfil_mira',  '00000000-0000-4000-8000-00000000d002', 'member', 'actiu', 'empresa');
select tests.create_user('perfil_fora',  '00000000-0000-4000-8000-00000000d003', 'member', 'baixa');

-- Socis des de fa un any: sense això cap activitat del passat comptaria, i la
-- ratxa sortiria zero per un motiu que no és el que es vol provar.
update public.profiles
   set created_at = now() - interval '365 days'
 where id in (
   '00000000-0000-4000-8000-00000000d001',
   '00000000-0000-4000-8000-00000000d002',
   '00000000-0000-4000-8000-00000000d003');

create temporary table qui as
select '00000000-0000-4000-8000-00000000d001'::uuid as mirat,
       '00000000-0000-4000-8000-00000000d002'::uuid as mira,
       '00000000-0000-4000-8000-00000000d003'::uuid as fora;
grant select on qui to authenticated;

create temporary table que as
select '00000000-0000-4000-8000-00000000de01'::uuid as e1,
       '00000000-0000-4000-8000-00000000de02'::uuid as e2,
       '00000000-0000-4000-8000-00000000de03'::uuid as e3,
       '00000000-0000-4000-8000-00000000de04'::uuid as e4,
       '00000000-0000-4000-8000-00000000de05'::uuid as secreta;
grant select on que to authenticated;

-- Totes del mateix `tipo`: amb tres menes diferents la insígnia «de tot» també
-- cauria, i el conjunt de codis que s'espera a sota deixaria de ser d'una sola
-- cosa.
insert into public.events (id, tipo, starts_at, puntos, published, reveal_at)
values
  ((select e1 from que), 'fiesta', now() - interval '60 days', 10, true, null),
  ((select e2 from que), 'fiesta', now() - interval '50 days', 10, true, null),
  ((select e3 from que), 'fiesta', now() - interval '40 days', 10, true, null),
  ((select e4 from que), 'fiesta', now() - interval '30 days', 10, true, null),
  -- La que encara no es pot dir: publicada, però amb el nom tapat fins d'aquí
  -- a deu dies. És el cas de `va_ser_idea_meva`.
  ((select secreta from que), 'fiesta', now() + interval '30 days', 10, true, now() + interval '10 days');

insert into public.event_title (event_id, titulo)
values
  ((select e1 from que), 'Primera Inventada'),
  ((select e2 from que), 'Segona Inventada'),
  ((select e3 from que), 'Tercera Inventada'),
  ((select e4 from que), 'Quarta Inventada'),
  ((select secreta from que), 'Festa Encara Sense Nom')
on conflict (event_id) do update set titulo = excluded.titulo;

-- Tres seguides i una que va fallar: ratxa en curs zero, millor marca tres.
insert into public.attendances (user_id, event_id, estado) values
  ((select mirat from qui), (select e1 from que), 'asistio'),
  ((select mirat from qui), (select e2 from que), 'asistio'),
  ((select mirat from qui), (select e3 from que), 'asistio');

-- ── 1. la porta ────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('pendent_alfa');

select throws_ok(
  $$ select public.member_streak('00000000-0000-4000-8000-00000000d001') $$,
  '42501', null,
  'qui encara espera l''alta no veu la ratxa de ningu'
);

select throws_ok(
  $$ select * from public.member_badges('00000000-0000-4000-8000-00000000d001') $$,
  '42501', null,
  'ni les insignies de ningu'
);

reset role;
select tests.authenticate_as('perfil_mira');

select ok(
  public.member_streak((select mirat from qui)) is not null,
  'i un soci actiu si: la ratxa d''un altre li arriba'
);

select lives_ok(
  $$ select * from public.member_badges('00000000-0000-4000-8000-00000000d001') $$,
  'i les insignies d''un altre tambe'
);

-- ── 2. la ratxa d'un altre és exactament la seva ───────────────────────────

select is(
  (public.member_streak((select mirat from qui)) ->> 'actual')::int, 0,
  'la ratxa en curs es zero: l''ultima activitat no hi va anar'
);

select is(
  (public.member_streak((select mirat from qui)) ->> 'millor')::int, 3,
  'i la millor marca son les tres seguides'
);

select is(
  (public.member_streak((select mirat from qui)) ->> 'perduda')::int, 3,
  'que es tambe el que es diu que s''ha perdut'
);

select is(
  (public.member_streak((select mirat from qui)) ->> 'compten')::int, 4,
  'compten les quatre passades i no la que encara no ha arribat'
);

-- La comparació que aguanta el disseny sencer: el mateix objecte, no els
-- mateixos quatre camps. Un camp nou que només arribés a una de les dues
-- portes no el veuria cap comparació escrita a mà.
reset role;
create temporary table ratxa_seva (j jsonb);
grant select, insert on ratxa_seva to authenticated;

select tests.authenticate_as('perfil_mirat');
insert into ratxa_seva select public.my_streak();

reset role;
select tests.authenticate_as('perfil_mira');

select is(
  public.member_streak((select mirat from qui)),
  (select j from ratxa_seva),
  'i es, camp per camp, la mateixa que ell mateix veu amb my_streak()'
);

-- ── 3. mirar un perfil no reparteix cap insígnia ───────────────────────────
-- El moment exacte: qui es mira ja s'ha guanyat «primera» —hi ha anat a tres
-- activitats— i encara no té cap fila a `badges`, perquè no ha obert mai la
-- seva pantalla. Si `member_badges()` repartís, aquí es veuria.

reset role;
select is(
  (select count(*)::int from public.badges where user_id = (select mirat from qui)),
  0,
  'de partida no te cap insignia desada, tot i haver-se-la guanyat'
);

select tests.authenticate_as('perfil_mira');

select is_empty(
  $$ select * from public.member_badges('00000000-0000-4000-8000-00000000d001') $$,
  'i per tant mirar-lo no ensenya res'
);

reset role;
select is(
  (select count(*)::int from public.badges where user_id = (select mirat from qui)),
  0,
  'sobretot: mirar-lo no li''n ha regalat cap'
);

-- El control positiu del de dalt. Sense això, un `grant_badges` que hagués
-- deixat de funcionar faria passar el zero d'abans per sempre.
select tests.authenticate_as('perfil_mirat');
select lives_ok(
  $$ select * from public.my_badges() $$,
  'la seva propia pantalla si que les reparteix'
);

reset role;
select is(
  (select count(*)::int from public.badges where user_id = (select mirat from qui)),
  1,
  'i aleshores «primera» ja hi es'
);

-- ── 4. i està declarada de manera que no ho pugui fer mai ──────────────────
-- `stable` no és decoració: un `insert` dins d'una funció no volàtil peta. És
-- el que fa que la regla d'aquí sobre sobrevisqui a qui la llegeixi malament.
select is(
  (select p.provolatile from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'member_badges'),
  's'::"char",
  'member_badges() es stable, o sigui que no pot escriure encara que algu ho provi'
);

select is(
  (select p.provolatile from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'my_badges'),
  'v'::"char",
  'i la teva es volatile, que es el contrast que li dona sentit'
);

-- ── 5. el que torna, i el títol que no ─────────────────────────────────────

reset role;
-- Una insígnia lligada a una activitat que encara no té nom públic. No la pot
-- repartir `grant_badges` aquí dins —caldria una proposta acceptada— i el que
-- es prova és la sortida, no com hi va arribar.
insert into public.badges (user_id, codi, event_id)
values ((select mirat from qui), 'va_ser_idea_meva', (select secreta from que));

select tests.authenticate_as('perfil_mira');

select set_eq(
  $$ select codi from public.member_badges('00000000-0000-4000-8000-00000000d001') $$,
  array['primera', 'va_ser_idea_meva'],
  'surten les dues insignies que te, i cap mes'
);

select is(
  (select b.titol from public.member_badges((select mirat from qui)) b where b.codi = 'primera'),
  'Primera Inventada',
  'la que ve d''una activitat passada porta el titol'
);

select is(
  (select b.starts_at from public.member_badges((select mirat from qui)) b where b.codi = 'primera'),
  (select e.starts_at from public.events e where e.id = (select e1 from que)),
  'i la data d''aquella activitat'
);

select is(
  (select b.titol from public.member_badges((select mirat from qui)) b where b.codi = 'va_ser_idea_meva'),
  null::text,
  'la que apunta a una activitat encara no revelada no porta titol'
);

select is(
  (select b.starts_at from public.member_badges((select mirat from qui)) b where b.codi = 'va_ser_idea_meva'),
  null::timestamptz,
  'ni data, que la delataria igual'
);

select ok(
  (select b.event_id from public.member_badges((select mirat from qui)) b
    where b.codi = 'va_ser_idea_meva') is not null,
  'pero l''identificador hi es: es la pantalla qui decideix que en fa'
);

-- El control positiu dels dos nulls de sobre: el títol existeix, i el que
-- falta és el permís per llegir-lo, no la fila.
reset role;
select is(
  (select t.titulo from public.event_title t where t.event_id = (select secreta from que)),
  'Festa Encara Sense Nom',
  'i el titol hi era: el que no hi era es el dret a llegir-lo'
);

-- ── 6. qui ha plegat no té perfil ──────────────────────────────────────────

reset role;
insert into public.badges (user_id, codi) values ((select fora from qui), 'primera');

select tests.authenticate_as('perfil_mira');

select ok(
  public.member_streak((select fora from qui)) is null,
  'd''algu de baixa no en surt cap ratxa'
);

select is_empty(
  $$ select * from public.member_badges('00000000-0000-4000-8000-00000000d003') $$,
  'ni cap insignia'
);

reset role;
select is(
  (select count(*)::int from public.badges where user_id = (select fora from qui)),
  1,
  'i no es perque no en tingui: la fila hi es, i no surt'
);

-- ── 7. les portes, i la que no n'és ────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.member_streak(uuid)', 'execute'),
  'anon no pot cridar member_streak()'
);

select ok(
  not has_function_privilege('anon', 'public.member_badges(uuid)', 'execute'),
  'ni member_badges()'
);

select ok(
  has_function_privilege('authenticated', 'public.member_streak(uuid)', 'execute'),
  'i un soci si'
);

select ok(
  has_function_privilege('authenticated', 'public.member_badges(uuid)', 'execute'),
  'les dues'
);

-- El càlcul no és una porta. Si algun dia ho fos, seria la ratxa de qualsevol
-- sense cap comprovació de qui la demana.
select ok(
  not has_function_privilege('authenticated', 'private.streak_of(uuid)', 'execute'),
  'el recompte de private.streak_of() no es cridable des de fora'
);

select * from finish();
rollback;

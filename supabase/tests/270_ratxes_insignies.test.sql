-- Ratxes i insígnies.
--
-- Les dues coses que aquest fitxer ha de deixar clavades, perquè totes dues
-- són decisions i no conseqüències:
--
--   Una activitat on la comi et va dir que no —llista d'espera, sol·licitud
--   sense resposta, rebuig— no trenca la ratxa de ningú. Si això es trenca,
--   l'app comença a renyar la gent per decisions nostres.
--
--   Una insígnia guanyada no marxa mai, i repartir-les dues vegades no en
--   duplica cap.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(47);

reset role;

-- El calendari, buit. Una ratxa es compta sobre TOTES les activitats passades,
-- o sigui que qualsevol festa del seed hi entraria i el número canviaria cada
-- cop que algú toqui les dades de demostració. Tot això viu dins d'una
-- transacció que es desfarà.
-- El registre de punts va primer: `points_log.event_id` és `on delete set
-- null`, i aquest UPDATE el para el disparador d'append-only.
delete from public.points_log;
delete from public.events;

-- ── gent nova, per no heretar res del seed ─────────────────────────────────
-- Els socis del seed ja tenen assistències, i una ratxa calculada sobre elles
-- canviaria de valor cada cop que algú toqués les dades de demostració.
select tests.create_user('ratxa_a',    '00000000-0000-4000-8000-00000000f001', 'member', 'actiu', 'politecnica');
select tests.create_user('ratxa_b',    '00000000-0000-4000-8000-00000000f002', 'member', 'actiu', 'empresa');
select tests.create_user('ratxa_c',    '00000000-0000-4000-8000-00000000f003', 'member', 'actiu', 'salut');
select tests.create_user('insig_a',    '00000000-0000-4000-8000-00000000f004', 'member', 'actiu', 'politecnica');
select tests.create_user('insig_tard', '00000000-0000-4000-8000-00000000f005', 'member', 'actiu', 'empresa');
select tests.create_user('insig_poc',  '00000000-0000-4000-8000-00000000f006', 'member', 'actiu', 'salut');

-- Socis des de fa un any: sense això cap esdeveniment del passat comptaria.
update public.profiles
   set created_at = now() - interval '365 days'
 where id in (
   '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000f002',
   '00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-00000000f004',
   '00000000-0000-4000-8000-00000000f005', '00000000-0000-4000-8000-00000000f006');

create temporary table qui as
select
  tests.uid('ratxa_a')    as a,
  tests.uid('ratxa_b')    as b,
  tests.uid('ratxa_c')    as c,
  tests.uid('insig_a')    as i,
  tests.uid('insig_tard') as tard,
  tests.uid('insig_poc')  as poc,
  tests.uid('alfa')       as alfa,
  tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

create temporary table que as
select
  '00000000-0000-4000-8000-00000000fe01'::uuid as e1,
  '00000000-0000-4000-8000-00000000fe02'::uuid as e2,
  '00000000-0000-4000-8000-00000000fe03'::uuid as e3,
  '00000000-0000-4000-8000-00000000fe04'::uuid as e4,
  '00000000-0000-4000-8000-00000000fe05'::uuid as e5,
  '00000000-0000-4000-8000-00000000fe06'::uuid as ara,
  '00000000-0000-4000-8000-00000000fe07'::uuid as dema,
  '00000000-0000-4000-8000-00000000fe08'::uuid as antic,
  '00000000-0000-4000-8000-00000000fe09'::uuid as deu_gent,
  '00000000-0000-4000-8000-00000000fe0a'::uuid as nou_gent;
grant select on que to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values
  ((select e1 from que),'fiesta',now() - interval '60 days',10,true),
  ((select e2 from que),'casa_rural',now() - interval '50 days',30,true),
  ((select e3 from que),'actividad',now() - interval '40 days',10,true),
  ((select e4 from que),'fiesta',now() - interval '30 days',10,true),
  ((select e5 from que),'fiesta',now() - interval '20 days',10,true),
  -- Passant ara mateix: encara s'hi pot fitxar, o sigui que encara no compta.
  ((select ara from que),'fiesta',now() - interval '1 hour',10,true),
  ((select dema from que),'fiesta',now() + interval '7 days',10,true),
  -- Abans que cap d'ells fos soci.
  ((select antic from que),'fiesta',now() - interval '390 days',10,true),
  ((select deu_gent from que),'fiesta',now() - interval '380 days',10,true),
  ((select nou_gent from que),'fiesta',now() - interval '379 days',10,true);

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ((select e1 from que), 'Primera Inventada'),
  ((select e2 from que), 'Segona Inventada'),
  ((select e3 from que), 'Tercera Inventada'),
  ((select e4 from que), 'Quarta Inventada'),
  ((select e5 from que), 'Cinquena Inventada'),
  -- Passant ara mateix: encara s'hi pot fitxar, o sigui que encara no compta.
  ((select ara from que), 'La d''Ara Mateix'),
  ((select dema from que), 'La de la Setmana'),
  -- Abans que cap d'ells fos soci.
  ((select antic from que), 'La de l''Any Passat'),
  ((select deu_gent from que), 'La de Deu'),
  ((select nou_gent from que), 'La de Nou')
on conflict (event_id) do update set titulo = excluded.titulo;

-- ── ratxa_a: tres seguides, en falla una, i en torna a fer una ─────────────
insert into public.attendances (user_id, event_id, estado) values
  ((select a from qui), (select e1 from que), 'asistio'),
  ((select a from qui), (select e2 from que), 'asistio'),
  ((select a from qui), (select e3 from que), 'asistio'),
  ((select a from qui), (select e5 from que), 'asistio');

-- ── ratxa_b: dues, en falla una, i les dues últimes no depenien d'ell ──────
insert into public.attendances (user_id, event_id, estado) values
  ((select b from qui), (select e1 from que), 'asistio'),
  ((select b from qui), (select e2 from que), 'asistio'),
  ((select b from qui), (select e4 from que), 'espera'),
  ((select b from qui), (select e5 from que), 'sollicitat');

-- ── ratxa_c: a totes cinc, i també a la de l'any passat ───────────────────
insert into public.attendances (user_id, event_id, estado) values
  ((select c from qui), (select e1 from que),    'asistio'),
  ((select c from qui), (select e2 from que),    'asistio'),
  ((select c from qui), (select e3 from que),    'asistio'),
  ((select c from qui), (select e4 from que),    'asistio'),
  ((select c from qui), (select e5 from que),    'asistio'),
  ((select c from qui), (select antic from que), 'asistio');

select tests.authenticate_as('ratxa_a');

select is(
  (public.my_streak() ->> 'actual')::int, 1,
  'la ratxa en curs és la que ve després de l''última absència'
);

select is(
  (public.my_streak() ->> 'millor')::int, 3,
  'i la millor marca es queda encara que s''hagi trencat'
);

select is(
  (public.my_streak() ->> 'perduda')::int, 0,
  'amb una ratxa viva no s''explica cap ratxa perduda'
);

select is(
  (public.my_streak() ->> 'compten')::int, 5,
  'compten les cinc passades i cap de les altres tres'
);

select is(
  (public.my_streak() ->> 'hi_has_anat')::int, 4,
  'i n''hi va anar a quatre'
);

reset role;
select tests.authenticate_as('ratxa_b');

select is(
  (public.my_streak() ->> 'actual')::int, 0,
  'qui va fallar l''última compta zero'
);

select is(
  (public.my_streak() ->> 'millor')::int, 2,
  'però la marca hi és'
);

select is(
  (public.my_streak() ->> 'perduda')::int, 2,
  'i es diu quant valia la que es va trencar'
);

select is(
  (public.my_streak() ->> 'trencada_el')::timestamptz,
  (select starts_at from public.events where id = (select e3 from que)),
  'amb la data de l''activitat que la va trencar'
);

-- La que aguanta tot el disseny: la comi el va deixar fora de dues, i cap de
-- les dues li compta ni a favor ni en contra.
select is(
  (public.my_streak() ->> 'compten')::int, 3,
  'una llista d''espera i una sol·licitud sense resposta no compten'
);

reset role;
select tests.authenticate_as('ratxa_c');

select is(
  (public.my_streak() ->> 'actual')::int, 5,
  'la festa que està passant ara no trenca la ratxa de ningú'
);

select is(
  (public.my_streak() ->> 'compten')::int, 5,
  'ni la d''ara, ni la de la setmana que ve, ni la d''abans de ser soci'
);

reset role;
select tests.authenticate_as('pendent_alfa');

select throws_ok(
  'select public.my_streak()',
  '42501',
  null,
  'qui encara no és soci actiu no té ratxa'
);

-- ── insígnies ──────────────────────────────────────────────────────────────
reset role;

-- Cinc activitats de tres menes, una amb les dues fotos de la nit.
insert into public.attendances (user_id, event_id, estado, entry_photo_url, exit_photo_url) values
  ((select i from qui), (select e1 from que), 'asistio', null, null),
  ((select i from qui), (select e2 from que), 'asistio', 'entrada/inventada.jpg', 'sortida/inventada.jpg'),
  ((select i from qui), (select e3 from que), 'asistio', null, null),
  ((select i from qui), (select e4 from que), 'asistio', null, null),
  ((select i from qui), (select e5 from que), 'asistio', null, null);

insert into public.points_log (user_id, event_id, motivo, puntos, granted_by) values
  ((select i from qui), (select e1 from que), 'montaje', 20, (select junta from qui));

insert into public.proposals (user_id, titol, estat) values
  ((select i from qui), 'Una Idea Inventada', 'acceptada');

-- Un cotxe amb algú a dins, i un altre buit.
insert into public.rides (id, event_id, driver_id, sentit, origen, places) values
  ('00000000-0000-4000-8000-00000000fd01', (select e2 from que), (select i from qui),
   'anada', 'Un Punt Inventat', 4),
  ('00000000-0000-4000-8000-00000000fd02', (select e2 from que), (select tard from qui),
   'anada', 'Un Altre Punt Inventat', 4);

insert into public.ride_seats (ride_id, user_id, estat) values
  ('00000000-0000-4000-8000-00000000fd01', (select alfa from qui), 'a_dins');

-- Deu fitxatges en una activitat: insig_a el tercer, insig_tard el vuitè.
-- Aquestes dues són d'abans que ningú fos soci a posta: les insígnies no miren
-- cap data, i així no entren a la ratxa de ningú i el recompte de dalt es queda
-- explicable amb els dits.
insert into public.attendances (user_id, event_id, estado, checked_in_at) values
  ((select alfa from qui),     (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '1 min'),
  ((select b from qui),        (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '2 min'),
  ((select i from qui),        (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '3 min'),
  ((select c from qui),        (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '4 min'),
  ((select a from qui),        (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '5 min'),
  ((select poc from qui),      (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '6 min'),
  ((select junta from qui),    (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '7 min'),
  ((select tard from qui),     (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '8 min'),
  (tests.uid('junta_bravo'),   (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '9 min'),
  (tests.uid('junta_charlie'), (select deu_gent from que), 'asistio', now() - interval '380 days' + interval '10 min');

-- I nou en una altra: insig_poc hi entra primer i tot i així no compta.
insert into public.attendances (user_id, event_id, estado, checked_in_at) values
  ((select poc from qui),      (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '1 min'),
  ((select alfa from qui),     (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '2 min'),
  ((select b from qui),        (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '3 min'),
  ((select c from qui),        (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '4 min'),
  ((select a from qui),        (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '5 min'),
  ((select junta from qui),    (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '6 min'),
  (tests.uid('junta_bravo'),   (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '7 min'),
  (tests.uid('junta_charlie'), (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '8 min'),
  (tests.uid('hidden_alfa'),   (select nou_gent from que), 'asistio', now() - interval '379 days' + interval '9 min');

select private.grant_badges((select i from qui));
select private.grant_badges((select tard from qui));

create temporary table seves as
select codi, event_id from public.badges where user_id = (select i from qui);
grant select on seves to authenticated;

select ok(exists (select 1 from seves where codi = 'primera'),
  'la primera activitat dóna la primera insígnia');

select ok(exists (select 1 from seves where codi = 'cinc'),
  'sis activitats passen de cinc');

select ok(not exists (select 1 from seves where codi = 'deu'),
  'i no arriben a deu');

select ok(exists (select 1 from seves where codi = 'cap_de_setmana'),
  'una casa rural dóna el cap de setmana');

select ok(exists (select 1 from seves where codi = 'de_tot'),
  'festa, casa rural i activitat són les tres menes');

select ok(exists (select 1 from seves where codi = 'entrada_i_sortida'),
  'les dues fotos d''una mateixa nit');

select ok(exists (select 1 from seves where codi = 'a_muntar'),
  'els punts de muntatge');

select ok(exists (select 1 from seves where codi = 'va_ser_idea_meva'),
  'una proposta acceptada');

select ok(exists (select 1 from seves where codi = 'al_volant'),
  'un cotxe amb algú a dins');

select ok(not exists (select 1 from seves where codi = 'copilot'),
  'i conduir no és haver anat al cotxe d''un altre');

select ok(exists (select 1 from seves where codi = 'de_les_primeres'),
  'el tercer a fitxar en una activitat de deu hi és');

-- ── d'on ve cada una ──────────────────────────────────────────
-- La targeta guanyada diu «Can Bravo · desembre», i això només pot sortir de la
-- fila. Les de comptar són les que més fàcil és equivocar: la primera activitat
-- d'insig_a és la més antiga en el temps, no la primera que es va inserir.

select is(
  (select event_id from seves where codi = 'primera'),
  (select deu_gent from que),
  'la primera és l''activitat més antiga a la qual va anar, no la primera inserida'
);

select is(
  (select event_id from seves where codi = 'cinc'),
  (select e4 from que),
  'i la de cinc és la cinquena de la fila, comptada per data'
);

select is(
  (select event_id from seves where codi = 'cap_de_setmana'),
  (select e2 from que),
  'el cap de setmana porta la casa rural'
);

select is(
  (select event_id from seves where codi = 'entrada_i_sortida'),
  (select e2 from que),
  'i entrada i sortida, la nit de les dues fotos'
);

select is(
  (select event_id from seves where codi = 'a_muntar'),
  (select e1 from que),
  'muntar porta l''activitat dels punts de muntatge'
);

select is(
  (select event_id from seves where codi = 'al_volant'),
  (select e2 from que),
  'i al volant, la del cotxe'
);

select is(
  (select event_id from seves where codi = 'de_les_primeres'),
  (select deu_gent from que),
  'de les primeres porta la nit on va fitxar dels cinc primers'
);

-- Tres menes d'activitat no són cap activitat en concret, i inventar-se'n una
-- seria mentir a la targeta. La pantalla ensenya la descripció.
select is(
  (select event_id from seves where codi = 'de_tot'),
  null,
  'de tot no porta cap activitat, perquè no n''hi ha cap de sola'
);

-- ── qui més la té ────────────────────────────────────────────
update public.profiles set avatar_url = 'https://exemple.invalid/a.jpg'
 where id = (select i from qui);
update public.profiles set avatar_url = 'https://exemple.invalid/h.jpg'
 where id = tests.uid('hidden_alfa');

select private.grant_badges(tests.uid('hidden_alfa'));

select tests.authenticate_as('insig_a');

select cmp_ok(
  (select quants from public.badge_holders() where codi = 'primera'),
  '>=', 2,
  'la primera la tenen com a mínim dues persones'
);

select is(
  (select total from public.badge_holders() where codi = 'primera'),
  (select count(*)::int from public.profiles where estat = 'actiu'),
  'i el total és la gent que hi és, que és el de «23 de 97»'
);

-- Amagar-se del rànquing treu la cara i no la persona: «la tenen 23» amb 22
-- cares seria una manera rebuscada de dir qui és el que falta.
select ok(
  'https://exemple.invalid/a.jpg' = any (
    select unnest(cares) from public.badge_holders() where codi = 'primera')
  and not (
    'https://exemple.invalid/h.jpg' = any (
      select unnest(cares) from public.badge_holders() where codi = 'primera')),
  'qui s''amaga del rànquing compta però no hi posa la cara'
);

reset role;

-- ── els dos casos que fan que la insígnia vulgui dir alguna cosa ───────────
select ok(
  not exists (
    select 1 from public.badges
     where user_id = (select tard from qui) and codi = 'de_les_primeres'),
  'el vuitè, no'
);

select ok(
  not exists (
    select 1 from public.badges
     where user_id = (select tard from qui) and codi = 'al_volant'),
  'ni un cotxe ofert i buit compta com haver portat ningú'
);

-- ── repartir-les dues vegades ─────────────────────────────────────────────
select tests.authenticate_as('insig_a');

select is(
  (select count(*)::int from public.my_badges()),
  (select count(*)::int from seves),
  'my_badges() no en duplica cap de les que ja hi eren'
);

-- ── el moment de guanyar-ne una ───────────────────────────────────────────
-- insig_poc encara no ha passat per grant_badges: la primera crida les hi ha
-- de repartir totes, i totes han d'arribar sense ensenyar.
reset role;
select tests.authenticate_as('insig_poc');

select isnt_empty(
  'select codi from public.my_badges()',
  'la primera crida reparteix el que ja tenia guanyat des de fa mesos'
);

select ok(
  (select bool_and(nova) from public.my_badges()),
  'i cap d''elles ve ensenyada'
);

select cmp_ok(
  public.mark_badges_seen(), '>', 0,
  'marcar-les diu quantes n''hi havia'
);

select ok(
  (select bool_and(not nova) from public.my_badges()),
  'i després cap és nova'
);

select is(
  public.mark_badges_seen(), 0,
  'ni en queda cap per marcar'
);

select ok(
  not exists (
    select 1 from public.badges
     where user_id = (select poc from qui) and codi = 'de_les_primeres'),
  'el primer de tots en una activitat de nou no hi és, o no voldria dir res'
);

-- ── qui pot escriure-hi i qui pot llegir-les ──────────────────────────────
select throws_ok(
  format('insert into public.badges (user_id, codi) values (%L, %L)',
         (select poc from qui), 'vint_i_cinc'),
  '42501',
  null,
  'un soci no es pot regalar una insígnia: no hi ha cap grant d''INSERT'
);

select is_empty(
  format('select codi from public.badges where user_id = %L', (select i from qui)),
  'ni veure les d''un altre'
);

reset role;
select tests.authenticate_as('junta_alfa');

select isnt_empty(
  format('select codi from public.badges where user_id = %L', (select i from qui)),
  'la junta sí, que és qui ha de poder mirar si això funciona'
);

reset role;
select * from finish();
rollback;

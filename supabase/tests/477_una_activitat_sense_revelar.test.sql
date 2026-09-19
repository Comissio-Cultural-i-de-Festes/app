-- Una activitat ja passada que encara no s'ha revelat: què se'n veu i què no.
--
-- PER QUÈ AQUEST FITXER. `fetchMemberNights()` afirmava en prosa que no li
-- calia cap branca per a les activitats sense revelar perquè «una activitat
-- sense revelar és del futur, i el que la tapa la deixa fora igualment». Res
-- no ho garanteix: `events` no té cap CHECK que lligui `reveal_at` amb
-- `starts_at`, i per tant una activitat que ja s'ha celebrat amb la revelació
-- engegada més enllà és una fila perfectament legal —la primera asserció
-- d'aquí és que l'`insert` passa. Amb ella al calendari, la llista de nits la
-- dibuixa.
--
-- I NO ÉS CAP FUITA, que és l'altra meitat i la que aquest fitxer fixa. La
-- data i el tipus ja són públics per a tot soci actiu: viuen a `events`, i
-- `events_select_member` només demana `published` i `abast <> 'junta'`. El que
-- la revelació tapa són les filles —`event_title` i `event_details`—, o sigui
-- el títol, la descripció i la ubicació, i les continua tapant. La fila surt
-- amb el nom genèric del tipus i prou.
--
-- Això no és cap comportament nou ni cap arreglament: és el que la base ja
-- feia. S'escriu perquè la prosa que ara ho diu es pugui comprovar, que és la
-- diferència entre un comentari i una afirmació.
--
-- EL CONTROL POSITIU HI ÉS PER PARELLES, com demana el capçal de la 370: de
-- cada cosa que s'espera tapada se'n comprova la bessona revelada, perquè el
-- dia que la consulta deixés de tornar res aquest fitxer seguiria verd dient
-- que la revelació tapa alguna cosa.
--
-- Gent i activitats inventades, com a tot el repositori.

begin;
select plan(6);

reset role;

delete from public.points_log;
delete from public.events;

select tests.create_user('rev_477', '00000000-0000-4000-8000-00000000d477', 'member', 'actiu', 'salut');

create temporary table que477 as
select '00000000-0000-4000-8000-00000000df78'::uuid as tapada,
       '00000000-0000-4000-8000-00000000df79'::uuid as oberta;
grant select on que477 to authenticated;

-- La fila que la prosa deia impossible: ja celebrada i encara sense revelar.
-- Que l'`insert` passi ja és la primera cosa que s'afirma.
insert into public.events (id, tipo, abast, starts_at, puntos, published, reveal_at)
values
  ((select tapada from que477), 'fiesta', 'comi', now() - interval '10 days', 10, true,
   now() + interval '30 days'),
  ((select oberta from que477), 'fiesta', 'comi', now() - interval '9 days', 10, true, null);

select ok(
  exists (select 1 from public.events
           where id = (select tapada from que477)
             and starts_at < now()
             and reveal_at > now()),
  'una activitat ja passada amb la revelacio al futur es una fila legal: cap CHECK no la impedeix'
);

insert into public.event_title (event_id, titulo)
values
  ((select tapada from que477), 'Festa secreta inventada'),
  ((select oberta from que477), 'Festa oberta inventada')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, ends_at, ubicacion)
values
  ((select tapada from que477), now() - interval '10 days' + interval '5 hours', 'Lloc inventat'),
  ((select oberta from que477), now() - interval '9 days'  + interval '5 hours', 'Altre lloc inventat')
on conflict (event_id) do update set ends_at = excluded.ends_at, ubicacion = excluded.ubicacion;

-- ── el que un soci ras en veu ──────────────────────────────────────────────

reset role;
select tests.authenticate_as('rev_477');

select is(
  (select count(*)::int from public.events
    where id = (select tapada from que477) and starts_at is not null),
  1,
  'la data d''una activitat sense revelar SI que arriba: viu a events, que la revelacio no tanca'
);

select is(
  (select count(*)::int from public.event_title
    where event_id = (select tapada from que477)),
  0,
  'el titol no, que viu a la filla que la revelacio tapa'
);

select is(
  (select count(*)::int from public.event_details
    where event_id = (select tapada from que477)),
  0,
  'i la ubicacio i l''hora de plegat tampoc, per la mateixa filla'
);

-- ── i per la vista, que és per on hi passa la resta de l'app ───────────────

select row_eq(
  $$ select titulo, starts_at is not null, revelat
       from public.events_public
      where id = '00000000-0000-4000-8000-00000000df78' $$,
  row(null::text, true, false),
  'events_public la serveix igual: sense titol, amb data, i dient que no esta revelada'
);

-- El contrast. Sense ell, el dia que la vista deixes de tornar res els nulls
-- de sobre seguirien verds dient que la revelacio tapa alguna cosa.
select row_eq(
  $$ select titulo, starts_at is not null, revelat
       from public.events_public
      where id = '00000000-0000-4000-8000-00000000df79' $$,
  row('Festa oberta inventada'::text, true, true),
  'i la germana revelada porta el titol: el null de sobre no es que no es vegi res'
);

select * from finish();
rollback;

-- El tauler de la junta.
--
-- La que aguanta el fitxer és una sola: qui surt a «s'estan despenjant» i qui
-- no. És el número que justifica tota la fase, i les dues maneres de trencar-lo
-- són simètriques — si hi surt tothom qui ha vingut un cop i no ha tornat, la
-- llista és inútil el primer dia; si no hi surt qui venia cada setmana i fa un
-- mes que no ve, la fase no serveix de res.
--
-- Persones i activitats inventades, com a tot el repo.

begin;
select plan(12);

reset role;

-- El calendari, buit: una llista de despenjats es calcula sobre TOTES les
-- activitats passades, i qualsevol festa del seed hi entraria.
delete from public.points_log;
delete from public.events;

create temporary table qui as
select
  tests.uid('alfa')       as fidel,      -- hi va sempre
  tests.uid('bravo')      as despenjat,  -- hi anava i ha parat
  tests.uid('charlie')    as nou,        -- acaba d'arribar
  tests.uid('delta')      as mai,        -- no hi ha anat mai
  tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

-- Socis des de fa mig any, tret del nou.
update public.profiles set created_at = now() - interval '180 days'
 where id in ((select fidel from qui), (select despenjat from qui), (select mai from qui));
update public.profiles set created_at = now() - interval '10 days'
 where id = (select nou from qui);

-- Vuit activitats, una cada set dies.
insert into public.events (id, tipo, starts_at, plazas, puntos, published)
select
  ('00000000-0000-4000-8000-0000000091' || lpad(g::text, 2, '0'))::uuid,
  case when g = 4 then 'casa_rural' else 'fiesta' end,
  now() - ((9 - g) * interval '7 days'),
  case when g = 4 then 2 else null end,
  10,
  true
from generate_series(1, 8) g;

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
select
  ('00000000-0000-4000-8000-0000000091' || lpad(g::text, 2, '0'))::uuid,
  'Activitat Inventada ' || g
from generate_series(1, 8) g
on conflict (event_id) do update set titulo = excluded.titulo;

create temporary table que as
select e.id, t.titulo
  from public.events e
  join public.event_title t on t.event_id = e.id;
grant select on que to authenticated;

-- El fidel hi va a totes vuit.
insert into public.attendances (user_id, event_id, estado)
select (select fidel from qui), id, 'asistio' from que;

-- El despenjat hi va a les sis primeres i para.
insert into public.attendances (user_id, event_id, estado)
select (select despenjat from qui), id, 'asistio'
from que where titulo not in ('Activitat Inventada 7', 'Activitat Inventada 8');

-- I la casa rural s'omple sempre: dues places i dues persones.
-- (ja hi són totes dues per les insercions de dalt)

-- Punts, per al repartiment per motius.
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
select (select fidel from qui), id, 'asistencia', 5, (select junta from qui) from que;

insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
select (select fidel from qui), id, 'montaje', 20, (select junta from qui)
from que where titulo = 'Activitat Inventada 2';

-- ── qui es despenja ─────────────────────────────────────────────────────────
select ok(
  private.drifting((select despenjat from qui), null, null),
  'qui venia sovint i fa dues seguides que no ve, es despenja'
);

-- Les dues maneres simètriques de trencar la llista.
select ok(
  not private.drifting((select fidel from qui), null, null),
  'qui hi va anar ahir, no'
);

select ok(
  not private.drifting((select mai from qui), null, null),
  'i qui no hi ha anat mai tampoc: no es pot despenjar de res'
);

select ok(
  not private.drifting((select nou from qui), null, null),
  'ni qui acaba d''arribar i encara no ha tingut ocasió'
);

-- ── qui el pot mirar ────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  'select public.admin_dashboard()',
  '42501',
  null,
  'el tauler és de la junta'
);

reset role;
select tests.authenticate_as('junta_alfa');

create temporary table tauler as select public.admin_dashboard() as d;
grant select on tauler to authenticated;

select is(
  (select jsonb_array_length(d -> 'despenjats') from tauler),
  1,
  'i n''hi surt exactament un'
);

select is(
  (select d -> 'despenjats' -> 0 ->> 'nom' from tauler),
  (select nombre from public.profiles where id = (select despenjat from qui)),
  'amb el nom de qui és'
);

-- Sense això la llista és un nom i prou, i «repartiu-vos-la» no es pot fer.
select is(
  (select d -> 'despenjats' -> 0 ->> 'ultima' from tauler),
  'Activitat Inventada 6',
  'i l''última a la qual va venir, que és el que es diu quan se li escriu'
);

-- ── la resta de targetes ────────────────────────────────────────────────────
select is(
  (select jsonb_array_length(d -> 'assistencia') from tauler),
  8,
  'l''assistència porta una fila per activitat passada'
);

select is(
  (select (x ->> 'sempre_plena')::boolean from tauler, jsonb_array_elements(d -> 'per_tipus') x
    where x ->> 'tipo' = 'casa_rural'),
  true,
  'i una casa rural sempre plena ho diu, que és el contrari del que diria la mitjana'
);

select is(
  (select (x ->> 'punts')::int from tauler, jsonb_array_elements(d -> 'punts_per_motiu') x
    where x ->> 'motivo' = 'asistencia'),
  40,
  'els punts es reparteixen per motiu'
);

-- I les dues xifres contesten preguntes diferents, cosa que és fàcil de llegir
-- com una contradicció: el despenjat va venir fa tres setmanes, o sigui que
-- encara compta com a actiu del mes, i alhora fa dues activitats seguides que
-- no ve. «Actiu» és una finestra de trenta dies; «despenjat» és el ritme.
select is(
  (select (x ->> 'actius')::int from tauler, jsonb_array_elements(d -> 'escoles') x
    where x ->> 'escola' = 'empresa'),
  1,
  'estar-se despenjant i comptar com a actiu del mes no es contradiuen'
);

reset role;
select * from finish();
rollback;

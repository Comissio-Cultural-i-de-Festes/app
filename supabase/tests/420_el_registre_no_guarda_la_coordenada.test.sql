-- El registre es queda amb la distància, no amb la coordenada.
--
-- LA MIGRACIÓ 65 treu `lat` i `lng` del `detall` que `check_in_here()` escriu a
-- `audit_log`. El motiu és que les mateixes dues dades ja estan tancades amb
-- privilegis de columna a `attendances`, i sortien igualment per aquí, cap a la
-- junta i durant 24 mesos.
--
-- EL CONTROL POSITIU ÉS LA MEITAT QUE IMPORTA. Sense ell, aquest fitxer passaria
-- igual si el registre no s'escrivís gens, i el que es vol és que segueixi
-- servint per a jutjar un fitxatge dubtós: la distància i el marge d'error s'hi
-- han de quedar.
--
-- Coordenades inventades i mar endins, com a 260_check_in_here.

begin;
select plan(9);

reset role;
delete from public.audit_log;

create temporary table quin as
select '00000000-0000-4000-8000-0000000000cf'::uuid as id;
grant select on quin to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values ((select id from quin), 'fiesta', now() - interval '1 hour', 10, true);

insert into public.event_details (event_id, ends_at)
values ((select id from quin), now() + interval '3 hours')
on conflict (event_id) do update set ends_at = excluded.ends_at;

-- 40 N, 1 E: mar obert, com el fitxer 260.
insert into private.event_geo (event_id, lat, lng, radi_m)
values ((select id from quin), 40.0, 1.0, 150);

-- ── Es fitxa des de dins del radi ───────────────────────────────────────────

select tests.authenticate_as('alfa');

select is(
  (select public.check_in_here((select id from quin), 40.0009, 1.0, 25)->>'estat'),
  'fet',
  'l''alfa fitxa des de cent metres'
);

reset role;

-- ── El que NO hi ha de ser ──────────────────────────────────────────────────

select is(
  (select count(*)::int from public.audit_log where accio = 'check_in_here'),
  1,
  'hi ha una linia de registre'
);

select ok(
  not (select detall ? 'lat' from public.audit_log where accio = 'check_in_here'),
  'i NO porta la latitud. Aixo es el que arregla la 65'
);

select ok(
  not (select detall ? 'lng' from public.audit_log where accio = 'check_in_here'),
  'ni la longitud'
);

-- ── El control positiu: el registre segueix servint per a alguna cosa ───────

select ok(
  (select detall ? 'dist_m' from public.audit_log where accio = 'check_in_here'),
  'pero si que porta la distancia, que es el que la junta mira'
);

select is(
  (select (detall->>'dist_m')::int from public.audit_log where accio = 'check_in_here'),
  100,
  'i el valor es el de debo, cent metres'
);

select ok(
  (select detall ? 'precisio_m' from public.audit_log where accio = 'check_in_here'),
  'i el marge d''error que va declarar el mobil'
);

select ok(
  (select detall ? 'walkin' from public.audit_log where accio = 'check_in_here'),
  'i si va entrar sense apuntar-se'
);

-- ── I la coordenada segueix a la seva taula, que es on te tanca ─────────────
--
-- La 65 no toca `attendances`: alli la coordenada te un motiu —refer el calcul
-- si el radi del local estava mal posat— i cap grant per a ningu.

select is(
  (select round(checkin_lat::numeric, 4) from public.attendances
    where event_id = (select id from quin)),
  round(40.0009::numeric, 4),
  'la coordenada segueix a attendances, tancada amb privilegis de columna'
);

select * from finish();
rollback;

-- La galeria d'una activitat.
--
-- Les tres assercions que aguanten el fitxer, i cap d'elles és sobre pujar
-- fotos:
--
--   Puja qui hi va fitxar. Dir que hi aniries i no venir-hi no dóna dret a
--   omplir la galeria d'aquella nit.
--
--   Despenjar-la l'amaga de tothom a l'instant, i es pot desfer. El fitxer no
--   marxa mai per una decisió presa a les tres de la matinada.
--
--   Qui va pujar la foto no pot saber qui l'ha denunciada. Si això es trenca,
--   la funció de denunciar deixa de servir per al cas que la justifica.
--
-- Persones i activitats inventades, com a tot el repo.

begin;
select plan(25);

reset role;

create temporary table qui as
select
  tests.uid('alfa')       as alfa,
  tests.uid('bravo')      as bravo,
  tests.uid('charlie')    as charlie,
  tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

create temporary table que as
select '00000000-0000-4000-8000-00000000fa01'::uuid as festa;
grant select on que to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values
  ((select festa from que),'fiesta',now() - interval '2 days',10,true);

-- El títol viu a `event_title` des de la migració 44.
insert into public.event_title (event_id, titulo)
values
  ((select festa from que), 'Festa Inventada')
on conflict (event_id) do update set titulo = excluded.titulo;

-- L'alfa i el bravo hi van ser. El charlie va dir que sí i no hi va anar.
insert into public.attendances (user_id, event_id, estado) values
  ((select alfa from qui),    (select festa from que), 'asistio'),
  ((select bravo from qui),   (select festa from que), 'asistio'),
  ((select charlie from qui), (select festa from que), 'si');

-- ── llegir un camí ──────────────────────────────────────────────────────────
select is(
  private.event_photo_owner(
    (select festa from que)::text || '/' || (select alfa from qui)::text || '/123.jpg'),
  (select alfa from qui),
  'el camí diu de qui és la foto'
);

select is(
  private.event_photo_event(
    (select festa from que)::text || '/' || (select alfa from qui)::text || '/123.jpg'),
  (select festa from que),
  'i de quina activitat'
);

-- Una política que rebi una excepció torna un 500 en comptes d'una negativa.
select is(
  private.event_photo_owner('això/no/és/un/camí.jpg'),
  null,
  'un camí mal format dóna null i no peta'
);

-- ── qui pot pujar ───────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select lives_ok(
  format(
    'insert into public.event_photos (id, event_id, user_id, path, thumb_path) '
    'values (%L, %L, %L, %L, %L)',
    '00000000-0000-4000-8000-00000000fb01',
    (select festa from que), (select alfa from qui),
    (select festa from que)::text || '/' || (select alfa from qui)::text || '/1.jpg',
    (select festa from que)::text || '/' || (select alfa from qui)::text || '/1.thumb.jpg'),
  'qui hi va fitxar puja'
);

select throws_ok(
  format(
    'insert into public.event_photos (event_id, user_id, path, thumb_path) '
    'values (%L, %L, %L, %L)',
    (select festa from que), (select bravo from qui), 'x/y/2.jpg', 'x/y/2.thumb.jpg'),
  '42501',
  null,
  'i no pot pujar-ne cap a nom d''un altre'
);

reset role;
select tests.authenticate_as('charlie');

-- La que aguanta que la galeria d'una nit sigui d'aquella nit.
select throws_ok(
  format(
    'insert into public.event_photos (event_id, user_id, path, thumb_path) '
    'values (%L, %L, %L, %L)',
    (select festa from que), (select charlie from qui), 'x/z/3.jpg', 'x/z/3.thumb.jpg'),
  '42501',
  null,
  'haver dit que hi aniries no és haver-hi estat'
);

-- ── qui la pot veure ────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.event_photos((select festa from que))),
  1,
  'la veu qualsevol soci, hi hagi estat o no: les fotos són de la festa'
);

select is(
  (select meva from public.event_photos((select festa from que))),
  false,
  'i sap que no és seva'
);

reset role;
select tests.authenticate_as('alfa');

select is(
  (select meva from public.event_photos((select festa from que))),
  true,
  'qui la va pujar sí que ho sap, que és qui pot esborrar-la'
);

select is(
  (select quantes from public.event_photo_count((select festa from que))),
  1,
  'el recompte del bloc del detall no demana les files'
);

-- ── denunciar-la ────────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('bravo');

select is(
  public.report_photo('00000000-0000-4000-8000-00000000fb01', 'hi_surto') ->> 'estat',
  'rebuda',
  'qualsevol soci pot demanar que la mirin'
);

-- Tocar-hi dues vegades no ha de posar la foto dues vegades a la cua ni treure
-- cap error a qui ja ho havia demanat i no se'n recorda.
select is(
  public.report_photo('00000000-0000-4000-8000-00000000fb01', 'hi_surto') ->> 'estat',
  'rebuda',
  'i fer-ho dos cops no en fa dues'
);

select is(
  (select count(*)::int from public.photo_reports),
  1,
  'a la taula n''hi ha una i prou'
);

select throws_ok(
  format('select public.report_photo(%L, %L)',
         '00000000-0000-4000-8000-00000000fb01', 'un_motiu_inventat'),
  '22023',
  null,
  'un motiu que no és de la llista no entra'
);

select is(
  (select denunciada from public.event_photos((select festa from que))),
  true,
  'i la pantalla pot dir-li que ja ho ha demanat'
);

-- ── i qui la va pujar no se n'assabenta ─────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select is_empty(
  'select id from public.photo_reports',
  'qui va pujar la foto no pot llegir cap denúncia'
);

select is(
  (select denunciada from public.event_photos((select festa from que))),
  false,
  'ni la seva pròpia foto li diu que algú l''ha denunciada'
);

select throws_ok(
  format('select public.admin_decide_photo(%L, true)',
         '00000000-0000-4000-8000-00000000fb01'),
  '42501',
  null,
  'ni pot despenjar res'
);

select is_empty(
  'select photo_id from public.admin_reported_photos()',
  'ni veure la cua de la junta'
);

-- ── la junta ────────────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select motiu from public.admin_reported_photos()),
  'hi_surto',
  'la cua porta el motiu, que és el que decideix què cal fer'
);

select is(
  public.admin_decide_photo('00000000-0000-4000-8000-00000000fb01', true) ->> 'estat',
  'despenjada',
  'i es despenja'
);

reset role;
select tests.authenticate_as('charlie');

select is(
  (select count(*)::int from public.event_photos((select festa from que))),
  0,
  'despenjada vol dir que ja no la veu ningú'
);

-- Denunciar una que ja no hi és no és cap error: qui ho demana no sap que algú
-- s'ha avançat.
select is(
  public.report_photo('00000000-0000-4000-8000-00000000fb01', 'hi_surto') ->> 'estat',
  'no_hi_es',
  'i demanar-ho quan ja s''ha fet ho diu, sense petar'
);

-- ── i es pot desfer ─────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_decide_photo('00000000-0000-4000-8000-00000000fb01', false) ->> 'estat',
  'penjada',
  'una decisió de les tres de la matinada es pot desfer'
);

select is_empty(
  'select photo_id from public.admin_reported_photos()',
  'i la cua queda buida tant si es despenja com si es deixa'
);

reset role;
select * from finish();
rollback;

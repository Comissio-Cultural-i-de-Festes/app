-- Les fotos de la porta: qui n'escriu, qui en veu, i qui no.
--
-- És el primer pgTAP que toca `storage`. No prova que un fitxer pugi de debò
-- —això és HTTP i no SQL— sinó el que decideix si pujaria: les polítiques
-- d'`storage.objects`, provades inserint-hi files com ho faria el servei.

begin;
select plan(33);

reset role;

-- ── el material ─────────────────────────────────────────────────────────────
create temp table who as
select
  tests.uid('alfa')  as alfa,   -- soci que va fitxar
  tests.uid('bravo') as bravo,  -- soci que no
  tests.uid('junta_alfa') as junta;
grant select on who to authenticated;

create temp table what as
select '00000000-0000-4000-8000-0000000000e5'::uuid as ev;
grant select on what to authenticated;

-- Alfa hi va entrar aquella nit; Bravo no.
update public.attendances
   set estado = 'asistio', checked_in_at = now(), entry_photo_url = null,
       exit_photo_url = null
 where user_id = (select alfa from who) and event_id = (select ev from what);

insert into public.attendances (user_id, event_id, estado)
select (select alfa from who), (select ev from what), 'asistio'
where not exists (
  select 1 from public.attendances
  where user_id = (select alfa from who) and event_id = (select ev from what)
);

update public.attendances
   set estado = 'asistio', checked_in_at = now(), entry_photo_url = null,
       exit_photo_url = null
 where user_id = (select alfa from who) and event_id = (select ev from what);

delete from public.attendances
 where user_id = (select bravo from who) and event_id = (select ev from what);

-- ── el camí, llegit ─────────────────────────────────────────────────────────
select is(
  private.door_photo_owner('entrada/' || (select ev from what) || '/' ||
                           (select alfa from who) || '/1.jpg'),
  (select alfa from who),
  'el camí diu de qui és la foto'
);

select is(
  private.door_photo_owner('sortida/' || (select ev from what) || '/' ||
                           (select alfa from who) || '/1.jpg'),
  (select alfa from who),
  'i tant per la de sortida com per la d''entrada'
);

select is(
  private.door_photo_owner('entrada/' || (select ev from what) || '/1.jpg'),
  null::uuid,
  'un camí curt no és de ningú'
);

select is(
  private.door_photo_owner('altra_cosa/x/' || (select alfa from who) || '/1.jpg'),
  null::uuid,
  'una primera carpeta que no toca tampoc'
);

select is(
  private.door_photo_owner('entrada/x/no-sóc-un-uuid/1.jpg'),
  null::uuid,
  'i un uuid que no ho és retorna null en comptes de petar'
);

-- ── la foto d'entrada, que ara te la fas tu ─────────────────────────────────
-- Fins a la migració 36 la feia l'escàner tot sol i l'escrivia la junta amb
-- `admin_set_entry_photo`. Ara arribes, fitxes per ubicació i te la fas, o no.
select tests.authenticate_as('alfa');

select is(
  public.set_entry_photo(
    (select ev from what),
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg'
  ) ->> 'estat',
  'desada',
  'la teva pròpia foto d''arribada'
);

reset role;
select is(
  (select entry_photo_url from public.attendances
    where user_id = (select alfa from who) and event_id = (select ev from what)),
  'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg',
  'i queda desada a la fila'
);
select tests.authenticate_as('alfa');

-- A diferència de quan la feia l'escàner, aquesta te la pots tornar a fer: la
-- d'abans era un registre que et feien i havia de ser immutable; aquesta és la
-- teva cara.
select is(
  public.set_entry_photo(
    (select ev from what),
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg'
  ) ->> 'estat',
  'desada',
  'i te la pots repetir'
);

reset role;
select is(
  (select entry_photo_url from public.attendances
    where user_id = (select alfa from who) and event_id = (select ev from what)),
  'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg',
  'la darrera és la que val'
);
select tests.authenticate_as('alfa');

select throws_ok(
  format(
    'select public.set_entry_photo(%L, %L)',
    (select ev from what),
    'entrada/' || (select ev from what) || '/' || (select bravo from who) || '/1.jpg'
  ),
  '42501',
  null,
  'i la carpeta d''un altre es refusa igual que a la de sortida'
);

-- La funció de la junta ja no hi és: no queda cap camí que l'hi porti.
select hasnt_function(
  'public'::name, 'admin_set_entry_photo'::name,
  'la junta ja no escriu la foto d''entrada de ningú'
);

-- ── la de sortida, la fa qui hi surt ────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select is(
  public.set_exit_photo(
    (select ev from what),
    'sortida/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg'
  ) ->> 'estat',
  'desada',
  'la teva pròpia foto de sortida'
);

select is(
  public.set_exit_photo(
    (select ev from what),
    'sortida/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg'
  ) ->> 'estat',
  'desada',
  'i te la pots tornar a fer, que és la teva cara'
);

reset role;
select is(
  (select exit_photo_url from public.attendances
    where user_id = (select alfa from who) and event_id = (select ev from what)),
  'sortida/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg',
  'la darrera és la que val'
);
select tests.authenticate_as('alfa');

select throws_ok(
  format(
    'select public.set_exit_photo(%L, %L)',
    (select ev from what),
    'sortida/' || (select ev from what) || '/' || (select bravo from who) || '/1.jpg'
  ),
  '42501',
  null,
  'un camí de la carpeta d''algú altre es refusa'
);

select throws_ok(
  format(
    'select public.set_exit_photo(%L, %L)',
    (select ev from what),
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg'
  ),
  '42501',
  null,
  'i la carpeta d''entrada tampoc, que aquella no la fas tu'
);

reset role;
select tests.authenticate_as('bravo');

select is(
  public.set_exit_photo(
    (select ev from what),
    'sortida/' || (select ev from what) || '/' || (select bravo from who) || '/1.jpg'
  ) ->> 'estat',
  'no_hi_vas_ser',
  'qui no hi va entrar no té final de nit per fotografiar'
);

-- ── les meves fotos, i només les meves ──────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.my_photos()
    where event_id = (select ev from what)),
  1,
  'la nit fotografiada surt a les meves fotos'
);

select is(
  (select entry_photo_url from public.my_photos()
    where event_id = (select ev from what)),
  'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg',
  'amb la d''entrada'
);

reset role;
select tests.authenticate_as('bravo');

-- Bravo no hi va entrar, o sigui que aquella nit no li surt: `my_photos`
-- llista les nits que has fitxat, amb foto o sense.
select is(
  (select count(*)::int from public.my_photos()
    where event_id = (select ev from what)),
  0,
  'i a les d''un altre no hi surt'
);

-- La columna ja no es pot llegir des de cap client, ni la teva.
select throws_ok(
  'select entry_photo_url from public.attendances limit 1',
  '42501',
  null,
  'el camí de la foto no es llegeix de la taula'
);

-- ── l'hora, i esborrar-la ───────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select isnt(
  (select exit_photo_at from public.my_photos()
    where event_id = (select ev from what)),
  null,
  'la de sortida porta la seva hora, que és el que va sota el díptic'
);

select is(
  public.clear_exit_photo((select ev from what)) ->> 'cami',
  'sortida/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg',
  'esborrar-la torna el camí, perquè el client pugui treure el fitxer'
);

select is(
  (select exit_photo_url from public.my_photos()
    where event_id = (select ev from what)),
  null,
  'i la fila ja no hi apunta'
);

select is(
  public.clear_exit_photo((select ev from what)) ->> 'estat',
  'no_en_tens',
  'i esborrar-la dues vegades no és cap error'
);

-- Torna-la a posar, que les polítiques d'storage de sota volen una nit sencera.
select is(
  public.set_exit_photo(
    (select ev from what),
    'sortida/' || (select ev from what) || '/' || (select alfa from who) || '/3.jpg'
  ) ->> 'estat',
  'desada',
  'i se la pot tornar a fer després d''esborrar-la'
);

-- ── les polítiques d'storage ────────────────────────────────────────────────
-- Inserint files a `storage.objects` com ho faria el servei, que és el que les
-- polítiques miren de debò.
-- Sense esborrar res primer: `storage.protect_delete()` no deixa treure files
-- d'aquestes taules a mà. Els comptes van filtrats per aquest esdeveniment.
reset role;
select tests.authenticate_as('alfa');

-- Des de la 36 la d'entrada te la fas tu, o sigui que la teva carpeta és teva
-- a totes dues bandes.
select lives_ok(
  format(
    'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'door-photos',
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/9.jpg',
    (select alfa from who)
  ),
  'la d''entrada a la seva pròpia carpeta, sí'
);

select throws_ok(
  format(
    'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'door-photos',
    'entrada/' || (select ev from what) || '/' || (select bravo from who) || '/9.jpg',
    (select alfa from who)
  ),
  '42501',
  null,
  'i a la d''un altre, no'
);

select lives_ok(
  format(
    'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'door-photos',
    'sortida/' || (select ev from what) || '/' || (select alfa from who) || '/9.jpg',
    (select alfa from who)
  ),
  'la de sortida a la seva pròpia carpeta sí'
);

select throws_ok(
  format(
    'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'door-photos',
    'sortida/' || (select ev from what) || '/' || (select bravo from who) || '/9.jpg',
    (select alfa from who)
  ),
  '42501',
  null,
  'i a la carpeta d''un altre no'
);

-- Qui veu què. La política de SELECT filtra, o sigui que no llança: compta.
reset role;
insert into storage.objects (bucket_id, name)
values (
  'door-photos',
  'entrada/' || (select ev from what) || '/' || (select bravo from who) || '/1.jpg'
);

select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'door-photos' and name like '%' || (select ev from what) || '%'),
  2,
  'un soci veu les seves dues i cap altra'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'door-photos'
      and name like 'entrada/' || (select ev from what) || '/%'),
  2,
  'la junta veu totes les d''entrada, que és el que fa comprovable una alta manual'
);

-- La promesa que hi ha escrita a la pantalla de la càmera: «ni la junta».
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'door-photos'
      and name like 'sortida/' || (select ev from what) || '/%'),
  0,
  'i cap de sortida, ni una'
);

-- Que un soci pugui esborrar la seva foto de sortida no es pot provar des
-- d'aquí: `storage.protect_delete()` prohibeix el DELETE directe a tothom,
-- inclosa la sessió que fa aquest test. Va a la suite d'RLS, que hi arriba per
-- l'API d'storage, que és per on hi arriba l'app.

reset role;
select * from finish();
rollback;

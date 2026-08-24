-- Les fotos de la porta: qui n'escriu, qui en veu, i qui no.
--
-- És el primer pgTAP que toca `storage`. No prova que un fitxer pugi de debò
-- —això és HTTP i no SQL— sinó el que decideix si pujaria: les polítiques
-- d'`storage.objects`, provades inserint-hi files com ho faria el servei.

begin;
select plan(27);

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

-- ── enganxar la foto d'entrada ──────────────────────────────────────────────
select tests.authenticate_as('alfa');

select throws_ok(
  format(
    'select public.admin_set_entry_photo(%L, %L, %L)',
    (select ev from what), (select alfa from who), 'entrada/x/y/1.jpg'
  ),
  '42501',
  null,
  'un soci no pot enganxar cap foto a cap fitxatge'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_set_entry_photo(
    (select ev from what), (select alfa from who),
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg'
  ) ->> 'estat',
  'desada',
  'la junta sí'
);

reset role;
select is(
  (select entry_photo_url from public.attendances
    where user_id = (select alfa from who) and event_id = (select ev from what)),
  'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg',
  'i queda desada a la fila'
);
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_set_entry_photo(
    (select ev from what), (select alfa from who),
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/2.jpg'
  ) ->> 'estat',
  'ja_en_te',
  'la primera guanya: una segona passada no la canvia'
);

reset role;
select is(
  (select entry_photo_url from public.attendances
    where user_id = (select alfa from who) and event_id = (select ev from what)),
  'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg',
  'i de debò no la canvia'
);
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_set_entry_photo(
    (select ev from what), (select bravo from who), 'entrada/x/y/1.jpg'
  ) ->> 'estat',
  'no_hi_es',
  'a qui no ha fitxat no se li pot enganxar res'
);

select throws_ok(
  format(
    'select public.admin_set_entry_photo(%L, %L, null)',
    (select ev from what), (select alfa from who)
  ),
  '22023',
  null,
  'i sense camí es refusa'
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
  'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg',
  'amb la d''entrada'
);

reset role;
select tests.authenticate_as('bravo');

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

-- ── les polítiques d'storage ────────────────────────────────────────────────
-- Inserint files a `storage.objects` com ho faria el servei, que és el que les
-- polítiques miren de debò.
-- Sense esborrar res primer: `storage.protect_delete()` no deixa treure files
-- d'aquestes taules a mà. Els comptes van filtrats per aquest esdeveniment.
reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  format(
    'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
    'door-photos',
    'entrada/' || (select ev from what) || '/' || (select alfa from who) || '/1.jpg',
    (select alfa from who)
  ),
  '42501',
  null,
  'un soci no pot pujar cap foto d''entrada, ni la seva'
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
  1,
  'un soci només veu els objectes de la seva carpeta'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'door-photos' and name like '%' || (select ev from what) || '%'),
  2,
  'i la junta els veu tots, que és el que fa comprovable una alta manual'
);

reset role;
select * from finish();
rollback;

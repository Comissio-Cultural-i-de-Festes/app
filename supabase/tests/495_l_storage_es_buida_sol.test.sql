-- L'storage es buida (migració 91).
--
-- El que es prova aquí és la decisió, que és de la base: quins objectes
-- sobren, i quina part en pot treure cadascú. Treure'ls ho fa l'app per l'API
-- de Storage, perquè `storage.protect_delete()` no deixa fer-ho des de SQL, i
-- això es prova a `tests/rls/storage_orfes.test.ts` i a mà.
--
-- EL BUCKET NO ESTÀ BUIT I NO ES POT SUPOSAR QUE HO ESTIGUI: la suite d'RLS hi
-- puja fitxers i no en desfà cap. Per això tot es pregunta per camins
-- concrets, i mai per quants n'hi ha.
--
-- Persones, activitats i camins inventats, com a tot el repo.

begin;
select plan(35);

reset role;

create temporary table qui as
select
  tests.uid('alfa')  as alfa,
  tests.uid('bravo') as bravo;
grant select on qui to authenticated;

create temporary table que as
select
  '00000000-0000-4000-8000-00000000a491'::uuid as vella,   -- gimcana de fa 40 dies
  '00000000-0000-4000-8000-00000000a492'::uuid as recent,  -- gimcana de fa 10 dies
  '00000000-0000-4000-8000-00000000a493'::uuid as viva,    -- amb portada
  '00000000-0000-4000-8000-00000000a494'::uuid as morta,   -- no existeix
  '00000000-0000-4000-8000-00000000a4a1'::uuid as prova_vella,
  '00000000-0000-4000-8000-00000000a4a2'::uuid as prova_recent,
  '00000000-0000-4000-8000-00000000a4a3'::uuid as prova_morta;
grant select on que to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values
  ((select vella from que),  'fiesta', now() - interval '40 days', 10, true),
  ((select recent from que), 'fiesta', now() - interval '10 days', 10, true),
  ((select viva from que),   'fiesta', now() + interval '7 days',  10, true);

insert into public.event_details (event_id, cover_url)
values ((select viva from que), '00000000-0000-4000-8000-00000000a493/2.jpg')
on conflict (event_id) do update set cover_url = excluded.cover_url;

insert into public.gimcanes (id, event_id)
values
  ('00000000-0000-4000-8000-00000000a4b1', (select vella from que)),
  ('00000000-0000-4000-8000-00000000a4b2', (select recent from que));

insert into public.gimcana_proves (id, gimcana_id, titol)
values
  ((select prova_vella from que),  '00000000-0000-4000-8000-00000000a4b1', 'Una prova inventada vella'),
  ((select prova_recent from que), '00000000-0000-4000-8000-00000000a4b2', 'Una prova inventada recent');

insert into public.gimcana_equips (id, gimcana_id, nom)
values
  ('00000000-0000-4000-8000-00000000a4c1', '00000000-0000-4000-8000-00000000a4b1', 'Equip vell'),
  ('00000000-0000-4000-8000-00000000a4c2', '00000000-0000-4000-8000-00000000a4b2', 'Equip recent');

insert into public.gimcana_enviaments (id, prova_id, user_id, equip_id, path)
values
  ('00000000-0000-4000-8000-00000000a4d1', (select prova_vella from que), (select alfa from qui),
   '00000000-0000-4000-8000-00000000a4c1',
   '00000000-0000-4000-8000-00000000a4a1/' || (select alfa from qui) || '/v.jpg'),
  ('00000000-0000-4000-8000-00000000a4d2', (select prova_recent from que), (select alfa from qui),
   '00000000-0000-4000-8000-00000000a4c2',
   '00000000-0000-4000-8000-00000000a4a2/' || (select alfa from qui) || '/r.jpg');

update public.profiles
   set avatar_url = (select alfa from qui) || '/200.jpg'
 where id = (select alfa from qui);

insert into public.attendances (user_id, event_id, estado, entry_photo_url)
values ((select alfa from qui), (select recent from que), 'asistio',
        'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/bona.jpg')
on conflict (user_id, event_id) do update set entry_photo_url = excluded.entry_photo_url;

insert into public.event_photos (event_id, user_id, path, thumb_path)
values ((select recent from que), (select alfa from qui),
        '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/g.jpg',
        '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/g.thumb.jpg');

-- Inserides com ho faria el servei. `created_at` a mà: és el que fa el dia de
-- marge.
insert into storage.objects (bucket_id, name, created_at)
select b, n, now() - age
from (values
  ('avatars', (select alfa from qui) || '/100.jpg',   interval '3 days'),
  ('avatars', (select alfa from qui) || '/200.jpg',  interval '3 days'),
  ('avatars', (select bravo from qui) || '/300.jpg', interval '1 hour'),
  ('avatars', 'no-es-un-uuid/x.jpg',                     interval '3 days'),
  ('event-covers', '00000000-0000-4000-8000-00000000a493/1.jpg', interval '3 days'),
  ('event-covers', '00000000-0000-4000-8000-00000000a493/2.jpg', interval '3 days'),
  ('event-covers', '00000000-0000-4000-8000-00000000a494/1.jpg', interval '3 days'),
  ('door-photos', 'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/bona.jpg', interval '3 days'),
  ('door-photos', 'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/100.jpg',   interval '3 days'),
  ('door-photos', 'sortida/00000000-0000-4000-8000-00000000a494/' || (select alfa from qui) || '/s.jpg', interval '3 days'),
  ('event-photos', '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/g.jpg', interval '3 days'),
  ('event-photos', '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/g.thumb.jpg', interval '3 days'),
  ('event-photos', '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/solta.jpg', interval '3 days'),
  ('gimcana-photos', '00000000-0000-4000-8000-00000000a4a1/' || (select alfa from qui) || '/v.jpg', interval '35 days'),
  ('gimcana-photos', '00000000-0000-4000-8000-00000000a4a2/' || (select alfa from qui) || '/r.jpg', interval '10 days'),
  ('gimcana-photos', '00000000-0000-4000-8000-00000000a4a3/' || (select alfa from qui) || '/m.jpg', interval '3 days'),
  ('gimcana-photos', '00000000-0000-4000-8000-00000000a4a3/' || (select bravo from qui) || '/m.jpg', interval '1 hour')
) as t(b, n, age);

create temporary table brossa as
select bucket, path from private.storage_garbage();

create or replace function pg_temp.sobra(p_bucket text, p_path text)
returns boolean language sql as $$
  select exists (select 1 from brossa where bucket = p_bucket and path = p_path)
$$;

-- ── avatars ─────────────────────────────────────────────────────────────────
select ok(pg_temp.sobra('avatars', (select alfa from qui) || '/100.jpg'),
  'un avatar que ja no és el del perfil sobra');
select ok(not pg_temp.sobra('avatars', (select alfa from qui) || '/200.jpg'),
  'el que el perfil fa servir no');
select ok(not pg_temp.sobra('avatars', (select bravo from qui) || '/300.jpg'),
  'un de fa una hora tampoc: pot ser el que s''està desant ara mateix');
select ok(not pg_temp.sobra('avatars', 'no-es-un-uuid/x.jpg'),
  'i un camí que no s''entén no es toca');

-- ── portades ────────────────────────────────────────────────────────────────
select ok(pg_temp.sobra('event-covers', '00000000-0000-4000-8000-00000000a493/1.jpg'),
  'la portada substituïda sobra');
select ok(not pg_temp.sobra('event-covers', '00000000-0000-4000-8000-00000000a493/2.jpg'),
  'la que l''esdeveniment fa servir no');
select ok(pg_temp.sobra('event-covers', '00000000-0000-4000-8000-00000000a494/1.jpg'),
  'la d''un esdeveniment esborrat sobra');

-- ── porta ───────────────────────────────────────────────────────────────────
select ok(not pg_temp.sobra('door-photos',
  'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/bona.jpg'),
  'la foto d''entrada que l''assistència fa servir no sobra');
select ok(pg_temp.sobra('door-photos',
  'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/100.jpg'),
  'la que s''ha refet sí');
select ok(pg_temp.sobra('door-photos',
  'sortida/00000000-0000-4000-8000-00000000a494/' || (select alfa from qui) || '/s.jpg'),
  'i la de sortida d''un esdeveniment que ja no hi és, també');

-- ── galeria ─────────────────────────────────────────────────────────────────
select ok(not pg_temp.sobra('event-photos',
  '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/g.jpg'),
  'una foto de la galeria amb fila no sobra');
select ok(not pg_temp.sobra('event-photos',
  '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/g.thumb.jpg'),
  'ni la seva miniatura');
select ok(pg_temp.sobra('event-photos',
  '00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/solta.jpg'),
  'una sense fila sí');

-- ── gimcana ─────────────────────────────────────────────────────────────────
select ok(pg_temp.sobra('gimcana-photos',
  '00000000-0000-4000-8000-00000000a4a1/' || (select alfa from qui) || '/v.jpg'),
  'la prova d''una gimcana tancada fa més de trenta dies sobra, encara que hi apunti una fila');
select ok(not pg_temp.sobra('gimcana-photos',
  '00000000-0000-4000-8000-00000000a4a2/' || (select alfa from qui) || '/r.jpg'),
  'la d''una tancada fa deu dies no');
select ok(pg_temp.sobra('gimcana-photos',
  '00000000-0000-4000-8000-00000000a4a3/' || (select alfa from qui) || '/m.jpg'),
  'la d''una prova que ja no existeix sí');
select ok(not pg_temp.sobra('gimcana-photos',
  '00000000-0000-4000-8000-00000000a4a3/' || (select bravo from qui) || '/m.jpg'),
  'però no si és de fa una hora');

-- ── la part de cadascú ──────────────────────────────────────────────────────
-- `my_storage_garbage` és el que l'app demana i esborra. Cada persona hi ha de
-- trobar el que les polítiques de Storage li deixen treure, i res més: el que
-- no hi és no es pot esborrar per l'API, i el que hi és de més és una foto
-- d'algú altre a la llista d'una persona que no l'havia de saber.
create or replace function pg_temp.meva(p_bucket text, p_path text)
returns boolean language sql as $$
  select exists (
    select 1 from public.my_storage_garbage(100000) g
    where g.bucket = p_bucket and g.path = p_path
  )
$$;
grant execute on function pg_temp.meva(text, text) to authenticated;

select tests.authenticate_as('alfa');

select ok(pg_temp.meva('avatars', (select alfa from qui) || '/100.jpg'),
  'el soci rep el seu avatar vell');
select ok(pg_temp.meva('door-photos',
  'sortida/00000000-0000-4000-8000-00000000a494/' || (select alfa from qui) || '/s.jpg'),
  'i la seva foto de sortida d''un esdeveniment esborrat');
select ok(not pg_temp.meva('event-covers', '00000000-0000-4000-8000-00000000a494/1.jpg'),
  'però no cap portada, que és cosa de la junta');
select ok(not pg_temp.meva('gimcana-photos',
  '00000000-0000-4000-8000-00000000a4a1/' || (select alfa from qui) || '/v.jpg'),
  'ni les proves de la gimcana, encara que siguin seves');

reset role;
select tests.authenticate_as('bravo');

select ok(not pg_temp.meva('avatars', (select alfa from qui) || '/100.jpg'),
  'un altre soci no rep l''avatar vell de ningú');
select ok(not pg_temp.meva('door-photos',
  'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/100.jpg'),
  'ni les seves fotos de porta');

reset role;
select tests.authenticate_as('junta_alfa');

select ok(pg_temp.meva('event-covers', '00000000-0000-4000-8000-00000000a493/1.jpg'),
  'la junta rep la portada substituïda');
select ok(pg_temp.meva('gimcana-photos',
  '00000000-0000-4000-8000-00000000a4a1/' || (select alfa from qui) || '/v.jpg'),
  'i les proves d''una gimcana vençuda');
select ok(pg_temp.meva('door-photos',
  'entrada/00000000-0000-4000-8000-00000000a492/' || (select alfa from qui) || '/100.jpg'),
  'i les fotos d''entrada sobrants de qualsevol');
select ok(not pg_temp.meva('door-photos',
  'sortida/00000000-0000-4000-8000-00000000a494/' || (select alfa from qui) || '/s.jpg'),
  'però no les de sortida d''un altre: la junta no les pot ni llegir');
select ok(not pg_temp.meva('avatars', (select alfa from qui) || '/100.jpg'),
  'ni l''avatar de ningú');

reset role;
select tests.authenticate_as('pendent_alfa');

select is(
  (select count(*)::int from public.my_storage_garbage(100000)),
  0,
  'qui encara espera l''alta no rep res'
);

reset role;

-- ── la marca a la fila ──────────────────────────────────────────────────────
select ok(
  private.mark_gimcana_photos_gone() >= 1,
  'el cron marca les proves de les gimcanes vençudes'
);

select isnt(
  (select foto_esborrada_at from public.gimcana_enviaments
    where id = '00000000-0000-4000-8000-00000000a4d1'),
  null,
  'la de la gimcana de fa quaranta dies queda marcada'
);

select is(
  (select foto_esborrada_at from public.gimcana_enviaments
    where id = '00000000-0000-4000-8000-00000000a4d2'),
  null,
  'la de fa deu dies no'
);

select tests.authenticate_as('junta_alfa');

select isnt(
  (select foto_esborrada_at from public.admin_gimcana_queue((select vella from que))
    where id = '00000000-0000-4000-8000-00000000a4d1'),
  null,
  'i la cua de validar ho diu, perquè la pantalla no pinti un requadre buit'
);

-- ── qui ho pot cridar ───────────────────────────────────────────────────────
reset role;

select ok(
  has_function_privilege('authenticated', 'public.my_storage_garbage(integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.my_storage_garbage(integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.storage_garbage()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.mark_gimcana_photos_gone()', 'EXECUTE'),
  'cadascú pregunta per la seva part; la llista sencera i la marca no són de ningú'
);

select is(
  (select schedule from cron.job where jobname = 'marca-proves-gimcana'),
  '10 4 * * *',
  'i el cron hi és, cada dia a les 4.10'
);

select * from finish();
rollback;

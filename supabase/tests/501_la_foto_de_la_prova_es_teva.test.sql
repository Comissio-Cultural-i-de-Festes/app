-- La foto d'una prova és de qui l'envia i d'aquella prova (migració 95).
--
-- `submit_prova` desava el camí tal com arribava. La política d'insert del
-- bucket només mira que la foto sigui a la carpeta de qui la puja; qui envia
-- la prova podia posar-hi el camí d'una foto d'un altre soci, o d'una altra
-- prova seva, i la junta la veia i la validava.
--
-- Ara el camí ha de ser exactament `<prova>/<qui>/<uuid>.jpg`, el que fa el
-- client, i ha de ser al bucket. Si no, 22023 amb la pista `prova_foto`, i no
-- s'escriu res: ni l'enviament ni, en mode lliure, l'equip on hauria caigut.
--
-- Persones, activitats i proves inventades, com a tot el repo.

begin;
select plan(18);

reset role;

create temporary table qui as
select
  tests.uid('alfa')       as alfa,     -- politecnica
  tests.uid('bravo')      as bravo,    -- empresa
  tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

create temporary table que as
select
  '00000000-0000-4000-8000-000000009501'::uuid as escoles,
  '00000000-0000-4000-8000-000000009502'::uuid as lliure;
grant select on que to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values
  ((select escoles from que), 'fiesta', now() - interval '1 hour', 10, true),
  ((select lliure from que),  'fiesta', now() - interval '1 hour', 10, true);

insert into public.event_title (event_id, titulo)
values
  ((select escoles from que), 'Festa Inventada de les Escoles'),
  ((select lliure from que),  'Festa Inventada Lliure')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, ends_at) values
  ((select escoles from que), now() + interval '4 hours'),
  ((select lliure from que),  now() + interval '4 hours')
on conflict (event_id) do update set ends_at = excluded.ends_at;

select tests.authenticate_as('junta_alfa');

select public.admin_save_gimcana(
  (select escoles from que), 'escoles',
  '[{"titol":"La foto de grup inventada","punts":10,"ordre":1},
    {"titol":"Una cançó inventada","punts":20,"ordre":2}]'::jsonb);

select public.admin_save_gimcana(
  (select lliure from que), 'lliure',
  '[{"titol":"Una prova lliure inventada","punts":10,"ordre":1}]'::jsonb);

reset role;

create temporary table p as
select
  (select pr.id from public.gimcana_proves pr join public.gimcanes g on g.id = pr.gimcana_id
    where g.event_id = (select escoles from que) and pr.titol = 'La foto de grup inventada') as grup,
  (select pr.id from public.gimcana_proves pr join public.gimcanes g on g.id = pr.gimcana_id
    where g.event_id = (select escoles from que) and pr.titol = 'Una cançó inventada') as canco,
  (select pr.id from public.gimcana_proves pr join public.gimcanes g on g.id = pr.gimcana_id
    where g.event_id = (select lliure from que)) as lliure,
  (select g.id from public.gimcanes g where g.event_id = (select lliure from que)) as g_lliure;
grant select on p to authenticated;

select tests.authenticate_as('junta_alfa');
select public.admin_save_teams((select g_lliure from p), array['Els Inventats', 'Els Altres']);
reset role;

-- Les fotos, com les deixaria el servei d'storage després de la pujada.
create temporary table f as
select
  format('%s/%s/%s.jpg', (select grup from p),   (select alfa from qui),
         '00000000-0000-4000-8000-00000000f501') as alfa_grup,
  format('%s/%s/%s.jpg', (select canco from p),  (select alfa from qui),
         '00000000-0000-4000-8000-00000000f502') as alfa_canco,
  format('%s/%s/%s.jpg', (select grup from p),   (select bravo from qui),
         '00000000-0000-4000-8000-00000000f503') as bravo_grup,
  format('%s/%s/%s.jpg', (select lliure from p), (select alfa from qui),
         '00000000-0000-4000-8000-00000000f504') as alfa_lliure,
  format('%s/%s/%s.jpg', (select grup from p),   (select alfa from qui),
         '00000000-0000-4000-8000-00000000f5ff') as alfa_mai_pujada;
grant select on f to authenticated;

insert into storage.objects (bucket_id, name, owner)
values
  ('gimcana-photos', (select alfa_grup from f),   (select alfa from qui)),
  ('gimcana-photos', (select alfa_canco from f),  (select alfa from qui)),
  ('gimcana-photos', (select bravo_grup from f),  (select bravo from qui)),
  ('gimcana-photos', (select alfa_lliure from f), (select alfa from qui));

-- La mateixa foto, però en un altre bucket: el nom coincideix i no compta.
insert into storage.objects (bucket_id, name, owner)
values ('event-photos', (select alfa_mai_pujada from f), (select alfa from qui));

select tests.authenticate_as('alfa');

-- ── la foto d'un altre ──────────────────────────────────────────────────────
select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p), (select bravo_grup from f)),
  '22023', null,
  'la foto d''un altre soci per a la mateixa prova no passa'
);

-- ── una foto meva, d'una altra prova ────────────────────────────────────────
select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p), (select alfa_canco from f)),
  '22023', null,
  'ni una foto pròpia que és d''una altra prova'
);

-- ── camins que no tenen la forma ────────────────────────────────────────────
select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p),
         format('%s/%s/../%s/%s.jpg', (select grup from p), (select alfa from qui),
                (select bravo from qui), '00000000-0000-4000-8000-00000000f503')),
  '22023', null,
  'un .. que surt de la carpeta pròpia no passa'
);

select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p),
         format('%s/%s/extra/%s.jpg', (select grup from p), (select alfa from qui),
                '00000000-0000-4000-8000-00000000f501')),
  '22023', null,
  'un segment de més tampoc'
);

select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p),
         format('%s/%s//%s.jpg', (select grup from p), (select alfa from qui),
                '00000000-0000-4000-8000-00000000f501')),
  '22023', null,
  'ni un segment buit'
);

select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p), '/' || (select alfa_grup from f)),
  '22023', null,
  'ni una barra al davant'
);

select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p),
         replace((select alfa_grup from f), '.jpg', '.png')),
  '22023', null,
  'ni una altra extensió'
);

select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p), ''),
  '22023', null,
  'ni un camí buit'
);

select throws_ok(
  format('select public.submit_prova(%L, null)', (select grup from p)),
  '22023', null,
  'ni cap camí'
);

-- ── una foto que no és al bucket ────────────────────────────────────────────
select throws_ok(
  format('select public.submit_prova(%L, %L)', (select grup from p), (select alfa_mai_pujada from f)),
  '22023', null,
  'un camí amb la forma bona però sense foto al bucket no passa, encara que n''hi hagi una amb el mateix nom en un altre'
);

-- El refús porta nom: la pantalla el tradueix pel HINT, no pel missatge.
reset role;
create temporary table pista (h text);
grant select, insert on pista to authenticated;
select tests.authenticate_as('alfa');

do $$
declare
  v_hint text;
begin
  perform public.submit_prova((select grup from p), (select bravo_grup from f));
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  insert into pista values (v_hint);
end;
$$;

select is(
  (select h from pista),
  'prova_foto',
  'i el refús porta la pista `prova_foto`, que és el que la pantalla tradueix'
);

reset role;

select is(
  (select count(*)::int from public.gimcana_enviaments
    where user_id = (select alfa from qui)),
  0,
  'i cap dels refusos ha deixat cap fila'
);

select tests.authenticate_as('alfa');

-- ── la bona ─────────────────────────────────────────────────────────────────
select is(
  public.submit_prova((select grup from p), (select alfa_grup from f),
                      '00000000-0000-4000-8000-00000000f501') ->> 'estat',
  'enviada',
  'la foto pròpia, de la prova que s''envia i que és al bucket, entra'
);

select is(
  public.submit_prova((select grup from p), (select alfa_grup from f),
                      '00000000-0000-4000-8000-00000000f501') ->> 'estat',
  'ja_enviada',
  'i reenviar-la des de la cua continua sent idempotent'
);

reset role;

select is(
  (select path from public.gimcana_enviaments where user_id = (select alfa from qui)),
  (select alfa_grup from f),
  'amb el camí que s''ha comprovat'
);

-- ── el refús no escriu res abans ────────────────────────────────────────────
-- En mode lliure, enviar sense equip et fa caure al més petit. Un camí que no
-- passa no ha de deixar ningú apuntat a un equip que no ha triat.
select tests.authenticate_as('alfa');

select throws_ok(
  format('select public.submit_prova(%L, %L)', (select lliure from p), (select bravo_grup from f)),
  '22023', null,
  'en mode lliure, una foto que no és la seva no passa'
);

reset role;

select is(
  (select count(*)::int from public.gimcana_membres
    where gimcana_id = (select g_lliure from p) and user_id = (select alfa from qui)),
  0,
  'i no l''ha apuntat a cap equip'
);

select tests.authenticate_as('alfa');

select is(
  public.submit_prova((select lliure from p), (select alfa_lliure from f)) ->> 'estat',
  'enviada',
  'mentre que amb la seva foto sí que hi cau, i la prova entra'
);

reset role;
select * from finish();
rollback;

-- La porta de tot el cap de setmana, i de més d'un esdeveniment (migració 89).
--
-- Els dos casos de l'issue: una casa rural de tres dies havia de seguir a la
-- porta tota l'estada, i dues activitats el mateix dia havien de tenir porta
-- totes dues. I el que no havia de canviar: una festa d'una nit entra i surt de
-- la porta a les mateixes hores que abans, i `porta` continua sent la primera.

begin;
select plan(17);

reset role;

create temporary table ids as
select
  '00000000-0000-4000-8000-0000000089c1'::uuid as casa,
  '00000000-0000-4000-8000-0000000089a1'::uuid as tarda,
  '00000000-0000-4000-8000-0000000089b1'::uuid as nit,
  '00000000-0000-4000-8000-0000000089d1'::uuid as esborrany,
  '00000000-0000-4000-8000-0000000089e1'::uuid as reunio,
  '00000000-0000-4000-8000-0000000089f1'::uuid as ahir;
grant select on ids to authenticated;

-- Tot el que ja sigui a la finestra, fora: el que es compta aquí són només les
-- files d'aquest fitxer. La condició és la de la 89, no la d'abans, perquè una
-- casa rural en marxa de les dades de prova també ocuparia la porta.
update public.events e set starts_at = now() + interval '90 days'
 where e.starts_at <= now() + interval '30 hours'
   and greatest(
         e.starts_at + interval '8 hours',
         (select d.ends_at from public.event_details d where d.event_id = e.id)
       ) >= now();

insert into public.events (id, tipo, abast, starts_at, plazas, precio_cents, puntos, published, created_by)
values
  ((select casa from ids),      'casa_rural', 'comi', now() - interval '1 day',  20, 9000, 30, true,  '00000000-0000-4000-8000-0000000000a1'),
  ((select tarda from ids),     'actividad',  'comi', now() + interval '3 hours', null, 0,  10, true,  '00000000-0000-4000-8000-0000000000a1'),
  ((select nit from ids),       'fiesta',     'comi', now() + interval '9 hours', 10, 1500, 10, true,  '00000000-0000-4000-8000-0000000000a1'),
  ((select esborrany from ids), 'fiesta',     'comi', now() + interval '2 hours', null, 0,  10, false, '00000000-0000-4000-8000-0000000000a1'),
  ((select reunio from ids),    'reunio',     'junta', now() + interval '1 hour', null, 0,   0, true,  '00000000-0000-4000-8000-0000000000a1'),
  ((select ahir from ids),      'fiesta',     'comi', now() - interval '9 hours', null, 0,  10, true,  '00000000-0000-4000-8000-0000000000a1');

insert into public.event_title (event_id, titulo) values
  ((select casa from ids),      'Casa de prova'),
  ((select tarda from ids),     'Taller de prova'),
  ((select nit from ids),       'Festa de prova'),
  ((select esborrany from ids), 'Esborrany de prova'),
  ((select reunio from ids),    'Junta de prova'),
  ((select ahir from ids),      'Festa d''ahir')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, ubicacion, ends_at) values
  ((select casa from ids),  'Masia inventada', now() + interval '2 days'),
  ((select tarda from ids), 'Aula 2',          now() + interval '5 hours'),
  ((select nit from ids),   'Nau 3',           now() + interval '15 hours'),
  ((select ahir from ids),  'Nau 3',           now() - interval '3 hours')
on conflict (event_id) do update set
  ubicacion = excluded.ubicacion,
  ends_at = excluded.ends_at;

insert into public.attendances (user_id, event_id, estado, pagado, checked_in_at) values
  (tests.uid('alfa'),    (select casa from ids), 'asistio', true,  now() - interval '20 hours'),
  (tests.uid('bravo'),   (select casa from ids), 'si',      false, null),
  (tests.uid('charlie'), (select nit from ids),  'si',      false, null);

select tests.authenticate_as('junta_alfa');

-- ── totes les de la finestra ────────────────────────────────────────────────
select is(
  (select array_agg(p->>'titulo' order by ord)
     from jsonb_array_elements(public.junta_home()->'portes') with ordinality as x(p, ord)),
  array['Casa de prova', 'Taller de prova', 'Festa de prova'],
  'la casa rural en marxa i les dues d''avui, en ordre d''inici'
);

select is(
  public.junta_home()->'porta',
  public.junta_home()->'portes'->0,
  '`porta` és la primera de `portes`, la mateixa que triava abans'
);

select is(
  public.junta_home()->'porta'->>'id',
  (select casa::text from ids),
  'i la primera és la que va començar abans: la casa rural'
);

select ok(
  (public.junta_home()->'porta'->>'ends_at') is not null,
  'cada porta porta quan s''acaba, per poder dir «de divendres a diumenge»'
);

-- Els números van amb cada una, no només amb la primera.
select is(
  (select (p->>'diuen_si')::int from jsonb_array_elements(public.junta_home()->'portes') p
    where p->>'id' = (select casa::text from ids)),
  2,
  'la casa rural compta qui hi va'
);

select is(
  (select (p->>'fitxats')::int from jsonb_array_elements(public.junta_home()->'portes') p
    where p->>'id' = (select casa::text from ids)),
  1,
  'i qui ja hi és, encara que fitxés ahir'
);

select is(
  (select (p->>'no_pagats')::int from jsonb_array_elements(public.junta_home()->'portes') p
    where p->>'id' = (select nit from ids)::text),
  1,
  'la segona porta té els seus propis números'
);

select is(
  (select (p->>'no_pagats')::int from jsonb_array_elements(public.junta_home()->'portes') p
    where p->>'id' = (select tarda from ids)::text),
  0,
  'i una activitat de franc segueix sense deutes'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.junta_home()->'portes') p
     where p->>'id' in ((select esborrany::text from ids), (select reunio::text from ids))
  ),
  'ni un esborrany ni una reunió fan porta'
);

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.junta_home()->'portes') p
     where p->>'id' = (select ahir::text from ids)
  ),
  'ni la festa que va començar fa nou hores i ja s''ha acabat'
);

-- ── la casa rural, l'últim dia ──────────────────────────────────────────────
reset role;
update public.events set starts_at = now() - interval '2 days' where id = (select casa from ids);
update public.event_details set ends_at = now() + interval '1 hour' where event_id = (select casa from ids);
select tests.authenticate_as('junta_alfa');

select is(
  public.junta_home()->'porta'->>'id',
  (select casa::text from ids),
  'diumenge a la tarda, dos dies després de començar, la casa rural encara és a la porta'
);

reset role;
update public.event_details set ends_at = now() - interval '1 hour' where event_id = (select casa from ids);
select tests.authenticate_as('junta_alfa');

select is(
  public.junta_home()->'porta'->>'id',
  (select tarda::text from ids),
  'i quan s''ha acabat, en surt, i la porta passa a la següent'
);

-- ── una festa d'una nit, com abans ──────────────────────────────────────────
-- Les vuit hores des de l'inici continuen manant quan s'acaba abans: la festa
-- de les deu que acaba a les quatre surt a les sis, no a les dotze.
reset role;
update public.events set starts_at = now() - interval '7 hours' where id = (select ahir from ids);
select tests.authenticate_as('junta_alfa');

select ok(
  exists (
    select 1 from jsonb_array_elements(public.junta_home()->'portes') p
     where p->>'id' = (select ahir::text from ids)
  ),
  'set hores després de començar, encara que ja hagi acabat, hi és'
);

reset role;
update public.events set starts_at = now() - interval '8 hours 30 minutes' where id = (select ahir from ids);
update public.event_details set ends_at = now() - interval '1 hour' where event_id = (select ahir from ids);
select tests.authenticate_as('junta_alfa');

select ok(
  not exists (
    select 1 from jsonb_array_elements(public.junta_home()->'portes') p
     where p->>'id' = (select ahir::text from ids)
  ),
  'i vuit hores i mitja després, acabada, ja no'
);

-- Sense hora de final, la regla de sempre.
reset role;
delete from public.event_details where event_id = (select ahir from ids);
update public.events set starts_at = now() - interval '7 hours' where id = (select ahir from ids);
select tests.authenticate_as('junta_alfa');

select ok(
  exists (
    select 1 from jsonb_array_elements(public.junta_home()->'portes') p
     where p->>'id' = (select ahir::text from ids)
  ),
  'sense hora de final, vuit hores des de l''inici'
);

-- ── i quan no hi ha res ─────────────────────────────────────────────────────
reset role;
update public.events set starts_at = now() + interval '60 days'
 where id in (select casa from ids union all select tarda from ids
              union all select nit from ids union all select ahir from ids);
select tests.authenticate_as('junta_alfa');

select is(
  public.junta_home()->'portes',
  '[]'::jsonb,
  'una llista buida, no null: qui la recorre no ha de preguntar res'
);

select is(
  public.junta_home()->'porta',
  'null'::jsonb,
  'i `porta` és null, com sempre que no hi ha porta'
);

select * from finish();
rollback;

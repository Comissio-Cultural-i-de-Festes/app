-- Els equips de la gimcana els fa la junta, els pot editar, i un error s'arregla.
--
-- El que la migració 97 promet, i que no es veu fins al dia que falla:
--
--   En mode junta ningú no cau sol en cap equip: espera la junta. I no pot
--   enviar cap foto mentre no en tingui.
--
--   La junta veu apuntats i fitxats, i posa, mou i treu. Un soci no pot.
--
--   Editar no esborra. Canviar el nom d'un equip no treu ningú; desar la
--   gimcana no s'emporta les fotos de les proves que segueixen; un equip amb
--   fotos no es pot treure; remenar conserva els noms.
--
--   Qui tria sol pot canviar mentre no hagi enviat res, i no després.
--
-- La concurrència (quaranta mòbils alhora) no es pot provar des d'una sola
-- transacció: és a `tests/rls/gimcana_equips.test.ts`, per la porta de debò.
--
-- Persones, activitats i proves inventades, com a tot el repo.

begin;
select plan(49);

reset role;

create temporary table qui as
select
  tests.uid('alfa')       as alfa,
  tests.uid('bravo')      as bravo,
  tests.uid('charlie')    as charlie,
  tests.uid('delta')      as delta,
  tests.uid('echo')       as echo,
  tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

create temporary table que as
select
  '00000000-0000-4000-8000-000000009b01'::uuid as ara,
  '00000000-0000-4000-8000-000000009b02'::uuid as altra;
grant select on que to authenticated;

insert into public.events (id, tipo, starts_at, puntos, published)
values
  ((select ara from que),   'fiesta', now() - interval '1 hour', 10, true),
  ((select altra from que), 'fiesta', now() - interval '1 hour', 10, true);

insert into public.event_title (event_id, titulo)
values
  ((select ara from que),   'Casa Inventada'),
  ((select altra from que), 'Sopar Inventat')
on conflict (event_id) do update set titulo = excluded.titulo;

insert into public.event_details (event_id, ends_at) values
  ((select ara from que),   now() + interval '2 days'),
  ((select altra from que), now() + interval '4 hours')
on conflict (event_id) do update set ends_at = excluded.ends_at;

-- alfa, bravo i delta han fitxat; charlie s'ha apuntat però no ha arribat;
-- echo no hi és de cap manera.
insert into public.attendances (user_id, event_id, estado) values
  ((select alfa from qui),    (select ara from que), 'asistio'),
  ((select bravo from qui),   (select ara from que), 'asistio'),
  ((select charlie from qui), (select ara from que), 'si'),
  ((select delta from qui),   (select ara from que), 'asistio'),
  ((select alfa from qui),    (select altra from que), 'asistio'),
  ((select bravo from qui),   (select altra from que), 'asistio'),
  ((select delta from qui),   (select altra from que), 'asistio');

-- ── la junta la munta en mode junta ─────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_save_gimcana(
    (select ara from que), 'junta',
    '[{"titol":"Tot l''equip dins la piscina buida","punts":10,"ordre":1},
      {"titol":"Una torre humana de tres","punts":20,"ordre":2}]'::jsonb
  ) ->> 'estat',
  'desada',
  'la junta munta la gimcana en mode junta'
);

reset role;
create temporary table g as
select id from public.gimcanes where event_id = (select ara from que);
grant select on g to authenticated;

create temporary table p as
select id, ordre from public.gimcana_proves where gimcana_id = (select id from g);
grant select on p to authenticated;

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_save_teams((select id from g), array['Blau', 'Verd', 'Groc']) ->> 'estat',
  'desats',
  'i hi posa tres equips amb nom'
);

reset role;
create temporary table e as
select id, ordre from public.gimcana_equips where gimcana_id = (select id from g);
grant select on e to authenticated;

insert into storage.objects (bucket_id, name, owner)
select 'gimcana-photos',
       format('%s/%s/00000000-0000-4000-8000-00000000b%s.jpg', pr.id, (select alfa from qui), v.n),
       (select alfa from qui)
from (values ('001', 1), ('002', 2)) as v(n, ordre)
join p pr on pr.ordre = v.ordre;

-- ── en mode junta ningú no cau sol ──────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select is(
  public.gimcana_for_event((select ara from que)) -> 'equip',
  'null'::jsonb,
  'en mode junta, obrir la gimcana no et posa en cap equip'
);

select is(
  public.submit_prova(
    (select id from p where ordre = 1),
    format('%s/%s/00000000-0000-4000-8000-00000000b001.jpg',
           (select id from p where ordre = 1), (select alfa from qui))) ->> 'estat',
  'sense_equip',
  'ni enviar una foto: espera que la junta et posi'
);

select is(
  public.gimcana_for_event((select ara from que)) -> 'pots_canviar',
  'false'::jsonb,
  'i en mode junta no es pot triar'
);

reset role;
select is(
  (select count(*)::int from public.gimcana_membres where gimcana_id = (select id from g)),
  0,
  'ningú no és a cap equip fins que la junta no l''hi posa'
);

-- ── la junta veu qui hi ha ──────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select array_agg(user_id order by user_id)
     from public.admin_gimcana_people((select id from g))),
  (select array_agg(u order by u) from (values
     ((select alfa from qui)), ((select bravo from qui)),
     ((select charlie from qui)), ((select delta from qui))) v(u)),
  'la junta veu els fitxats i els apuntats, i ningú més'
);

select is(
  (select ha_arribat from public.admin_gimcana_people((select id from g))
    where user_id = (select charlie from qui)),
  false,
  'i sap qui encara no ha arribat'
);

-- ── posar, moure, treure ────────────────────────────────────────────────────
select is(
  public.admin_set_team((select id from g), (select alfa from qui),
                        (select id from e where ordre = 1)) ->> 'estat',
  'fet',
  'la junta posa algú en un equip'
);

select is(
  private.gimcana_team((select id from g), (select alfa from qui)),
  (select id from e where ordre = 1),
  'i hi és'
);

select is(
  public.admin_set_team((select id from g), (select alfa from qui),
                        (select id from e where ordre = 2)) ->> 'estat',
  'fet',
  'el pot moure a un altre'
);

select is(
  private.gimcana_team((select id from g), (select alfa from qui)),
  (select id from e where ordre = 2),
  'i ara és a l''altre, no a tots dos'
);

select is(
  public.admin_set_team((select id from g), (select alfa from qui)) ->> 'estat',
  'fet',
  'el pot treure de l''equip'
);

select is(
  private.gimcana_team((select id from g), (select alfa from qui)),
  null::uuid,
  'i es queda sense equip'
);

select is(
  public.admin_set_team((select id from g), (select alfa from qui),
                        '00000000-0000-4000-8000-00000000dead'::uuid) ->> 'estat',
  'no_hi_es',
  'un equip que no és d''aquesta gimcana no serveix'
);

select is(
  public.admin_set_team((select id from g), (select charlie from qui),
                        (select id from e where ordre = 3)) ->> 'estat',
  'fet',
  'qui encara no ha arribat també es pot posar'
);

select lives_ok(
  $$ select public.admin_set_team((select id from g), (select alfa from qui),
                                  (select id from e where ordre = 1));
     select public.admin_set_team((select id from g), (select bravo from qui),
                                  (select id from e where ordre = 2)) $$,
  'alfa a Blau i bravo a Verd'
);

-- ── un soci no pot ──────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_set_team((select id from g), (select bravo from qui),
                                  (select id from e where ordre = 1)) $$,
  '42501', null,
  'un soci no es pot canviar d''equip per la porta de la junta'
);

select throws_ok(
  $$ select * from public.admin_gimcana_people((select id from g)) $$,
  '42501', null,
  'ni veure la llista de la junta'
);

select throws_ok(
  $$ insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
     values ((select id from g), (select bravo from qui), (select id from e where ordre = 1)) $$,
  '42501', null,
  'ni escriure a la taula directament'
);

-- ── ara sí que juga ─────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select is(
  public.gimcana_for_event((select ara from que)) -> 'equip' ->> 'nom',
  'Blau',
  'quan la junta el posa, la gimcana li diu amb qui juga'
);

select is(
  public.submit_prova(
    (select id from p where ordre = 1),
    format('%s/%s/00000000-0000-4000-8000-00000000b001.jpg',
           (select id from p where ordre = 1), (select alfa from qui))) ->> 'estat',
  'enviada',
  'i ja pot enviar'
);

-- ── canviar el nom no treu ningú ────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_save_teams((select id from g), array['Blaus', 'Verds', 'Grocs']) ->> 'estat',
  'desats',
  'la junta canvia els noms a mitja partida'
);

select is(
  private.gimcana_team((select id from g), (select alfa from qui)),
  (select id from e where ordre = 1),
  'i tothom és on era: el mateix equip, no un de nou'
);

select is(
  (select nom from public.gimcana_equips where id = (select id from e where ordre = 1)),
  'Blaus',
  'amb el nom nou'
);

reset role;
select is(
  (select count(*)::int from public.gimcana_enviaments s
    join public.gimcana_proves pr on pr.id = s.prova_id
    where pr.gimcana_id = (select id from g)),
  1,
  'i la foto que s''havia enviat segueix allà'
);

-- ── treure un equip ─────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_save_teams((select id from g), array[]::text[]) ->> 'estat',
  'equip_amb_fotos',
  'un equip que ja ha enviat fotos no es pot treure'
);

select is(
  (select count(*)::int from public.gimcana_equips where gimcana_id = (select id from g)),
  3,
  'i quan es refusa no toca res'
);

select is(
  public.admin_save_teams((select id from g), array['Blaus', 'Verds']) ->> 'estat',
  'desats',
  'un equip sense fotos sí que es pot treure'
);

select is(
  private.gimcana_team((select id from g), (select charlie from qui)),
  null::uuid,
  'i qui hi era es queda sense equip, per tornar-lo a posar'
);

select is(
  private.gimcana_team((select id from g), (select bravo from qui)),
  (select id from e where ordre = 2),
  'però la resta no es mou'
);

select is(
  public.admin_save_teams((select id from g), array['Blaus', 'Verds', '  ']) ->> 'estat',
  'desats',
  'un nom en blanc és un equip sense nom, no un error'
);

select is(
  (select nom from public.gimcana_equips where gimcana_id = (select id from g) and ordre = 3),
  null,
  'i es mostra com «Equip 3»'
);

-- ── desar la gimcana no s'emporta les fotos ─────────────────────────────────
select is(
  public.admin_save_gimcana(
    (select ara from que), 'junta',
    jsonb_build_array(
      jsonb_build_object('id', (select id from p where ordre = 1),
                         'titol', 'Tot l''equip dins la piscina, buida', 'punts', 15, 'ordre', 1))
  ) ->> 'estat',
  'desada',
  'la junta corregeix una prova i en treu una altra'
);

reset role;
select is(
  (select count(*)::int from public.gimcana_enviaments s
    join public.gimcana_proves pr on pr.id = s.prova_id
    where pr.gimcana_id = (select id from g)),
  1,
  'la foto de la prova corregida no es perd'
);

select is(
  (select punts from public.gimcana_proves where id = (select id from p where ordre = 1)),
  15,
  'i la prova és la mateixa, amb els punts nous'
);

select is(
  (select count(*)::int from public.gimcana_proves where gimcana_id = (select id from g)),
  1,
  'la prova que s''ha tret ja no hi és'
);

-- ── remenar amb una foto pendent ────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_shuffle_teams((select id from g), 2) ->> 'estat',
  'ja_jugada',
  'remenar quan ja hi ha una foto, encara que no estigui validada, no es pot'
);

-- ── en mode lliure: canviar mentre no has enviat res ────────────────────────
select is(
  public.admin_save_gimcana(
    (select ara from que), 'lliure',
    jsonb_build_array(
      jsonb_build_object('id', (select id from p where ordre = 1),
                         'titol', 'Tot l''equip dins la piscina, buida', 'punts', 15, 'ordre', 1))
  ) ->> 'estat',
  'desada',
  'la junta passa la gimcana a mode lliure'
);

reset role;
select tests.authenticate_as('delta');

select is(
  public.pick_team((select id from e where ordre = 1)) ->> 'estat',
  'fet',
  'qui encara no té equip en tria un'
);

select is(
  public.gimcana_for_event((select ara from que)) -> 'pots_canviar',
  'true'::jsonb,
  'i mentre no envia res, la gimcana li diu que pot canviar'
);

select is(
  public.pick_team((select id from e where ordre = 2)) ->> 'estat',
  'fet',
  'i canvia'
);

select is(
  private.gimcana_team((select id from g), (select delta from qui)),
  (select id from e where ordre = 2),
  'i ara és a l''altre'
);

reset role;
select tests.authenticate_as('alfa');

select is(
  public.pick_team((select id from e where ordre = 2)) ->> 'estat',
  'ja_has_enviat',
  'qui ja ha enviat una foto no es pot canviar sol'
);

select is(
  public.gimcana_for_event((select ara from que)) -> 'pots_canviar',
  'false'::jsonb,
  'i la gimcana ja no li ofereix'
);

-- ── remenar conserva els noms ───────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_save_gimcana((select altra from que), 'sorteig',
    '[{"titol":"Un brindis sense mans","punts":10,"ordre":1}]'::jsonb) ->> 'estat',
  'desada',
  'una altra gimcana, en sorteig'
);

-- Una sentència per crida: dins d'una de sola, la subconsulta de l'`id` no
-- veuria la gimcana que la crida anterior acaba de crear.
select is(
  public.admin_save_teams(
    (select id from public.gimcanes where event_id = (select altra from que)),
    array['Llops', 'Óssos']) ->> 'estat',
  'desats',
  'amb dos equips amb nom'
);

select is(
  public.admin_shuffle_teams(
    (select id from public.gimcanes where event_id = (select altra from que)), 3) ->> 'gent',
  '3',
  'remenar en tres reparteix els tres que han fitxat'
);

select is(
  (select array_agg(coalesce(nom, '—') order by ordre) from public.gimcana_equips
    where gimcana_id = (select id from public.gimcanes where event_id = (select altra from que))),
  array['Llops', 'Óssos', '—'],
  'i els equips que ja tenien nom el conserven'
);

select * from finish();
rollback;

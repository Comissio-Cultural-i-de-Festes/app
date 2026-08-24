-- La gimcana.
--
-- Les regles del joc, que és el que ha d'estar clavat:
--
--   Una prova puntua un cop per equip. Cinc persones del mateix equip enviant
--   la mateixa prova no multipliquen els punts, i un altre equip la pot fer
--   igualment. Ho para un índex únic i no el codi.
--
--   De quin equip sóc té una sola resposta, amb quatre maneres de repartir la
--   gent i cap que deixi ningú fora.
--
--   Remenar els equips a mitja partida no es pot fer. El marcador ja no
--   s'aguantaria i no hi hauria manera d'explicar-ho a ningú.
--
-- Persones, activitats i proves inventades, com a tot el repo.

begin;
select plan(28);

reset role;

create temporary table qui as
select
  tests.uid('alfa')       as alfa,     -- politecnica
  tests.uid('bravo')      as bravo,    -- empresa
  tests.uid('charlie')    as charlie,  -- salut
  tests.uid('delta')      as delta,    -- politecnica
  tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

create temporary table que as
select
  '00000000-0000-4000-8000-000000009a01'::uuid as ara,
  '00000000-0000-4000-8000-000000009a02'::uuid as dema;
grant select on que to authenticated;

insert into public.events (id, titulo, tipo, starts_at, puntos, published) values
  ((select ara from que),  'Festa Inventada d''Ara', 'fiesta', now() - interval '1 hour', 10, true),
  ((select dema from que), 'Festa Inventada de Demà', 'fiesta', now() + interval '7 days', 10, true);

insert into public.event_details (event_id, ends_at) values
  ((select ara from que), now() + interval '4 hours');

insert into public.attendances (user_id, event_id, estado) values
  ((select alfa from qui),    (select ara from que), 'asistio'),
  ((select bravo from qui),   (select ara from que), 'asistio'),
  ((select charlie from qui), (select ara from que), 'asistio'),
  ((select delta from qui),   (select ara from que), 'asistio');

-- ── la munta la junta ───────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_save_gimcana(
    (select ara from que), 'escoles',
    '[{"titol":"El grup sencer davant la porta","punts":10,"ordre":1},
      {"titol":"Algú de primer cantant","punts":20,"ordre":2}]'::jsonb
  ) ->> 'estat',
  'desada',
  'la junta la munta d''una sola crida'
);

reset role;

create temporary table g as
select id from public.gimcanes where event_id = (select ara from que);
grant select on g to authenticated;

create temporary table p as
select id, titol from public.gimcana_proves
where gimcana_id = (select id from g);
grant select on p to authenticated;

select is(
  (select count(*)::int from public.gimcana_equips where gimcana_id = (select id from g)),
  3,
  'i en mode escoles els tres equips es fan sols, sense configurar res'
);

select is(
  (select count(*)::int from p),
  2,
  'amb les seves dues proves'
);

-- ── de quin equip sóc ───────────────────────────────────────────────────────
-- La que fa que ningú es quedi fora: en mode escoles surt del perfil i no cal
-- que ningú s'apunti a res.
select is(
  private.gimcana_team((select id from g), (select alfa from qui)),
  (select id from public.gimcana_equips
    where gimcana_id = (select id from g) and escola = 'politecnica'),
  'en mode escoles, l''equip surt del perfil'
);

select isnt(
  private.gimcana_team((select id from g), (select bravo from qui)),
  private.gimcana_team((select id from g), (select alfa from qui)),
  'i dues escoles diferents són dos equips diferents'
);

select is(
  private.gimcana_team((select id from g), (select delta from qui)),
  private.gimcana_team((select id from g), (select alfa from qui)),
  'mentre que dos de la mateixa escola juguen junts'
);

-- ── enviar-ne una ───────────────────────────────────────────────────────────
select tests.authenticate_as('alfa');

select is(
  public.submit_prova(
    (select id from p where titol = 'Algú de primer cantant'), 'x/y/1.jpg') ->> 'estat',
  'enviada',
  'qui juga n''envia una'
);

select is(
  public.submit_prova(
    (select id from p where titol = 'Algú de primer cantant'), 'x/y/2.jpg') ->> 'estat',
  'ja_enviada',
  'i mentre la junta la mira, no se''n pot enviar una altra de la mateixa'
);

-- La cua de fora de línia es reenvia sencera quan torna la xarxa, i no ha de
-- fer dues files de res.
select is(
  public.submit_prova(
    (select id from p where titol = 'El grup sencer davant la porta'), 'x/y/3.jpg',
    '00000000-0000-4000-8000-00000000cc01') ->> 'estat',
  'enviada',
  'una amb identificador de petició entra'
);

select is(
  public.submit_prova(
    (select id from p where titol = 'El grup sencer davant la porta'), 'x/y/3.jpg',
    '00000000-0000-4000-8000-00000000cc01') ->> 'estat',
  'ja_enviada',
  'i reenviar-la no en fa dues'
);

-- ── qui pot validar ─────────────────────────────────────────────────────────
select throws_ok(
  format('select public.admin_decide_prova(%L, true)',
         (select id from public.gimcana_enviaments limit 1)),
  '42501',
  null,
  'un soci no valida les seves pròpies proves'
);

select is_empty(
  format('select id from public.admin_gimcana_queue(%L)', (select ara from que)),
  'ni veu la cua'
);

-- ── la junta valida ─────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select a_la_cua from public.admin_gimcana_queue((select ara from que)) limit 1),
  2,
  'la cua diu quantes n''hi ha, que és el que compensa validar abans de puntuar'
);

select is(
  public.admin_decide_prova(
    (select s.id from public.gimcana_enviaments s
      join public.gimcana_proves pr on pr.id = s.prova_id
      where pr.titol = 'Algú de primer cantant' limit 1),
    true) ->> 'estat',
  'validada',
  'i val'
);

-- ── un cop per equip ────────────────────────────────────────────────────────
-- El delta és de la mateixa escola que l'alfa: la prova ja és seva.
reset role;
select tests.authenticate_as('delta');

select is(
  public.submit_prova(
    (select id from p where titol = 'Algú de primer cantant'), 'x/z/9.jpg') ->> 'estat',
  'ja_feta',
  'un company del mateix equip no la pot tornar a fer'
);

-- Però una altra escola sí, que és el joc.
reset role;
select tests.authenticate_as('bravo');

select is(
  public.submit_prova(
    (select id from p where titol = 'Algú de primer cantant'), 'w/v/1.jpg') ->> 'estat',
  'enviada',
  'i un altre equip sí, que és precisament el joc'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  public.admin_decide_prova(
    (select s.id from public.gimcana_enviaments s
      join public.gimcana_proves pr on pr.id = s.prova_id
      join public.gimcana_equips e on e.id = s.equip_id
      where pr.titol = 'Algú de primer cantant' and e.escola = 'empresa' limit 1),
    true) ->> 'estat',
  'validada',
  'i la seva també val'
);

-- ── el marcador ─────────────────────────────────────────────────────────────
select is(
  (select punts from public.gimcana_scoreboard((select id from g))
    where escola = 'politecnica'),
  20,
  'el marcador suma les proves validades del teu equip'
);

select is(
  (select punts from public.gimcana_scoreboard((select id from g)) where escola = 'salut'),
  0,
  'i qui no n''ha fet cap hi surt amb zero, que també és una posició'
);

-- ── remenar, quan ja s'ha jugat ─────────────────────────────────────────────
select is(
  public.admin_shuffle_teams((select id from g), 3) ->> 'estat',
  'ja_jugada',
  'remenar els equips a mitja partida no es pot fer'
);

select is(
  public.admin_save_teams((select id from g), array['Els Vermells', 'Els Blaus']) ->> 'estat',
  'ja_jugada',
  'ni refer-los a mà'
);

-- ── la finestra ─────────────────────────────────────────────────────────────
select is(
  public.admin_save_gimcana(
    (select dema from que), 'sorteig',
    '[{"titol":"Una prova inventada","punts":10,"ordre":1}]'::jsonb) ->> 'estat',
  'desada',
  'una gimcana de la setmana que ve es pot preparar'
);

reset role;

create temporary table g2 as
select id from public.gimcanes where event_id = (select dema from que);
grant select on g2 to authenticated;

select tests.authenticate_as('alfa');

select is(
  public.gimcana_for_event((select dema from que)) ->> 'estat',
  'tancada',
  'però fins que no comenci la festa no la veu ningú'
);

select is(
  public.gimcana_for_event((select ara from que)) ->> 'estat',
  'oberta',
  'i la d''aquesta nit sí'
);

-- ── qui arriba tard ─────────────────────────────────────────────────────────
-- El sorteig reparteix qui ha fitxat; qui fitxa després no hi és, i ha de caure
-- al més petit en obrir-la en comptes de quedar-se dret mirant.
reset role;
-- Tres que ja hi eren quan la junta va remenar.
insert into public.attendances (user_id, event_id, estado) values
  ((select bravo from qui),   (select dema from que), 'asistio'),
  ((select charlie from qui), (select dema from que), 'asistio'),
  ((select delta from qui),   (select dema from que), 'asistio');

select tests.authenticate_as('junta_alfa');

select is(
  (public.admin_shuffle_teams((select id from g2), 2) ->> 'gent')::int,
  3,
  'remenar reparteix qui ha fitxat'
);

reset role;

select is(
  (select count(distinct equip_id)::int from public.gimcana_membres
    where gimcana_id = (select id from g2)),
  2,
  'i els reparteix, no els posa tots al mateix'
);

-- I l'alfa arriba tard: fitxa quan els equips ja estan fets.
insert into public.attendances (user_id, event_id, estado) values
  ((select alfa from qui), (select dema from que), 'asistio');

select ok(
  private.gimcana_join_smallest((select id from g2), (select alfa from qui)) is not null,
  'qui arriba quan els equips ja estan fets cau al més petit'
);

select is(
  (select count(*)::int from public.gimcana_equips where gimcana_id = (select id from g2)),
  2,
  'i no se''n crea cap de nou només per a ell'
);

reset role;
select * from finish();
rollback;

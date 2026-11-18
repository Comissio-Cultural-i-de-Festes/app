-- La 92 reescriu el rànquing d'escoles, la ratxa i els despenjats perquè vagin
-- de pressa amb un curs sencer a dins. La promesa és que no canvia cap número,
-- i aquest fitxer la comprova de l'única manera que val: les definicions
-- d'abans, copiades aquí tal com eren, contra les d'ara, sobre les mateixes
-- files i dins de la mateixa transacció (o sigui amb el mateix `now()`).
--
-- Les còpies viuen a `pg_temp` i desapareixen amb la sessió. La de la ratxa
-- crida `private.checkin_open_at` de debò, i això és a posta: la 92 escriu la
-- finestra de fitxar en línia, i si algun dia aquella funció canvia i aquesta
-- no, és aquí on es veu.
--
-- Es compara sense canviar de rol, amb el `sub` de la junta a les claims: les
-- funcions de `pg_temp` no són `security definer`, i com a `authenticated` les
-- velles veurien la meitat de les files per RLS i compararien una altra cosa.
--
-- Persones i activitats inventades, com a tot el repo.

begin;
select plan(38);

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', tests.uid('junta_alfa')::text, 'role', 'authenticated')::text,
  true
);

-- ── les definicions d'abans ─────────────────────────────────────────────────
-- `ranking_escoles_period`, migració 11.
create function pg_temp.old_ranking_escoles_period(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  escola           text,
  membres          int,
  esdeveniments    int,
  punts_totals     int,
  punts_per_membre numeric,
  posicio          int
)
language sql
stable
as $fn$
  with scored as (
    select
      pl.user_id,
      pl.event_id,
      pl.puntos,
      coalesce(e.starts_at, pl.created_at) as moment
    from public.points_log pl
    left join public.events e on e.id = pl.event_id
  ),
  per_escola as (
    select
      p.escola,
      count(*)::int as membres,
      coalesce(sum(t.punts), 0)::int as punts_totals
    from public.profiles p
    left join lateral (
      select sum(s.puntos)::int as punts
        from scored s
       where s.user_id = p.id
         and (p_from is null or s.moment >= p_from)
         and (p_to   is null or s.moment <  p_to)
    ) t on true
    where p.estat = 'actiu' and p.escola is not null
    group by p.escola
  ),
  esdeveniments_escola as (
    select p.escola, count(distinct s.event_id)::int as esdeveniments
      from public.profiles p
      join scored s on s.user_id = p.id
     where p.estat = 'actiu'
       and p.escola is not null
       and s.event_id is not null
       and (p_from is null or s.moment >= p_from)
       and (p_to   is null or s.moment <  p_to)
     group by p.escola
  )
  select
    pe.escola,
    pe.membres,
    coalesce(ee.esdeveniments, 0),
    pe.punts_totals,
    round(pe.punts_totals::numeric / nullif(pe.membres, 0), 2),
    rank() over (
      order by pe.punts_totals::numeric / nullif(pe.membres, 0) desc nulls last
    )::int
  from per_escola pe
  left join esdeveniments_escola ee on ee.escola = pe.escola
  where pe.membres >= 3
    and (select private.is_active_member())
$fn$;

-- `streak_rows`, migració 48.
create function pg_temp.old_streak_rows(p_user uuid)
returns table(event_id uuid, starts_at timestamptz, hi_va_anar boolean)
language sql
stable
as $$
  select
    e.id,
    e.starts_at,
    coalesce(a.estado, 'no') = 'asistio'
  from public.events e
  join public.profiles p on p.id = p_user
  left join public.attendances a
    on a.event_id = e.id and a.user_id = p_user
  where e.published
    and upper(private.checkin_open_at(e.id)) < (now() at time zone 'UTC')
    and e.starts_at >= p.created_at
    and coalesce(a.estado, 'no') not in ('espera', 'sollicitat', 'rebutjat')
    and e.abast <> 'junta'
  order by e.starts_at, e.id
$$;

-- `drifting`, migració 41, sobre la ratxa d'abans.
create function pg_temp.old_drifting(p_user uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language sql
stable
as $$
  with files as (
    select r.hi_va_anar, row_number() over (order by r.starts_at desc) as recent
    from pg_temp.old_streak_rows(p_user) r
    where (p_from is null or r.starts_at >= p_from)
      and (p_to is null or r.starts_at < p_to)
  )
  select
    count(*) >= 4
    and not bool_or(hi_va_anar) filter (where recent <= 2)
    and coalesce(
      avg(case when hi_va_anar then 1.0 else 0.0 end) filter (where recent > 2),
      0) >= 0.5
  from files
$$;

-- El bloc dels despenjats d'`admin_dashboard`, migració 82. La resta del
-- tauler la 92 no la toca. Ordenat per id i no per `ultima_at`: dues persones
-- que van venir per última vegada a la mateixa festa no tenen cap ordre, ni
-- abans ni ara.
create function pg_temp.old_despenjats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(x order by x.id), '[]'::jsonb)
  from (
    select
      p.id,
      p.nombre as nom,
      p.escola,
      p.curs,
      c.telefon,
      (select count(*)::int from pg_temp.old_streak_rows(p.id) r
        where r.hi_va_anar
          and (p_from is null or r.starts_at >= p_from)
          and (p_to is null or r.starts_at < p_to)) as hi_va_anar,
      (select count(*)::int from pg_temp.old_streak_rows(p.id) r
        where (p_from is null or r.starts_at >= p_from)
          and (p_to is null or r.starts_at < p_to)) as comptaven,
      (select t.titulo from public.attendances a
        join public.events e on e.id = a.event_id
        left join public.event_title t on t.event_id = e.id
        where a.user_id = p.id and a.estado = 'asistio'
        order by e.starts_at desc limit 1) as ultima,
      (select e.starts_at from public.attendances a
        join public.events e on e.id = a.event_id
        where a.user_id = p.id and a.estado = 'asistio'
        order by e.starts_at desc limit 1) as ultima_at
    from public.profiles p
    left join public.profile_contact c on c.id = p.id
    where p.estat = 'actiu'
      and pg_temp.old_drifting(p.id, p_from, p_to)
  ) x
$$;

create function pg_temp.new_despenjats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(x order by x ->> 'id'), '[]'::jsonb)
  from jsonb_array_elements(public.admin_dashboard(p_from, p_to) -> 'despenjats') x
$$;

-- ── el calendari, buit, i les files d'aquest fitxer ─────────────────────────
delete from public.points_log;
delete from public.events;

-- Cinc persones per a la ratxa, sòcies des de fa mig any tret de la nova.
select tests.create_user('r497_fidel',     '00000000-0000-4000-8497-000000000001', 'member', 'actiu', 'politecnica');
select tests.create_user('r497_despenjat', '00000000-0000-4000-8497-000000000002', 'member', 'actiu', 'empresa');
select tests.create_user('r497_nova',      '00000000-0000-4000-8497-000000000003', 'member', 'actiu', 'salut');
select tests.create_user('r497_mai',       '00000000-0000-4000-8497-000000000004', 'member', 'actiu', 'salut');
select tests.create_user('r497_estats',    '00000000-0000-4000-8497-000000000005', 'member', 'actiu', 'politecnica');

update public.profiles set created_at = now() - interval '180 days'
 where id in (tests.uid('r497_fidel'), tests.uid('r497_despenjat'),
              tests.uid('r497_mai'), tests.uid('r497_estats'));
update public.profiles set created_at = now() - interval '10 days'
 where id = tests.uid('r497_nova');

-- Vuit activitats setmanals, i al voltant tots els casos de la finestra de
-- fitxar i de què compta.
insert into public.events (id, tipo, starts_at, puntos, published, abast)
select ('00000000-0000-4000-8497-0000000001' || lpad(g::text, 2, '0'))::uuid,
       case when g = 4 then 'casa_rural' else 'fiesta' end,
       now() - ((9 - g) * interval '7 days'), 10, true, 'comi'
from generate_series(1, 8) g;

insert into public.events (id, tipo, starts_at, puntos, published, abast)
values
  -- Al mateix minut que la cinquena: l'id desempata.
  ('00000000-0000-4000-8497-000000000201', 'fiesta',     now() - interval '28 days', 10, true,  'comi'),
  -- Comença fa dues hores i acaba d'aquí a tres: encara obert.
  ('00000000-0000-4000-8497-000000000202', 'fiesta',     now() - interval '2 hours', 10, true,  'comi'),
  -- `ends_at` dues hores abans de començar: el rang és buit i `upper()` NULL.
  ('00000000-0000-4000-8497-000000000203', 'fiesta',     now() - interval '10 days', 10, true,  'comi'),
  -- Les reunions: la de junta no compta, la de tothom sí.
  ('00000000-0000-4000-8497-000000000204', 'reunio',     now() - interval '15 days',  5, true,  'junta'),
  ('00000000-0000-4000-8497-000000000205', 'reunio',     now() - interval '16 days',  5, true,  'comi'),
  ('00000000-0000-4000-8497-000000000206', 'fiesta',     now() - interval '17 days', 10, false, 'comi'),
  ('00000000-0000-4000-8497-000000000207', 'fiesta',     now() + interval '5 days',  10, true,  'comi'),
  ('00000000-0000-4000-8497-000000000208', 'fiesta',     now() - interval '200 days', 10, true, 'comi'),
  -- Sense `event_details`: sis hores per defecte, més una. Una tancada fa mitja
  -- hora i una que es tanca d'aquí a mitja hora; amb cinc hores o amb set, una
  -- de les dues canviaria de costat.
  ('00000000-0000-4000-8497-000000000209', 'actividad',  now() - interval '7 hours 30 minutes', 10, true, 'comi'),
  ('00000000-0000-4000-8497-000000000210', 'actividad',  now() - interval '6 hours 30 minutes', 10, true, 'comi'),
  -- Amb final: l'hora de marge de després, també per mitja hora a cada banda.
  ('00000000-0000-4000-8497-000000000212', 'actividad',  now() - interval '4 hours', 10, true,  'comi'),
  ('00000000-0000-4000-8497-000000000213', 'actividad',  now() - interval '5 hours', 10, true,  'comi'),
  -- Una casa rural que va començar ahir i encara dura.
  ('00000000-0000-4000-8497-000000000211', 'casa_rural', now() - interval '1 day',  30, true,  'comi');

update public.events set starts_at = (
  select starts_at from public.events where id = '00000000-0000-4000-8497-000000000105')
 where id = '00000000-0000-4000-8497-000000000201';

insert into public.event_title (event_id, titulo)
select id, 'Activitat 497 ' || right(id::text, 3) from public.events
on conflict (event_id) do update set titulo = excluded.titulo;

-- Detalls: la 1 i la 209/210 no en tenen; la 2 en té sense final.
insert into public.event_details (event_id, ends_at)
select e.id,
  case
    when e.id = '00000000-0000-4000-8497-000000000102' then null
    when e.id = '00000000-0000-4000-8497-000000000104' then e.starts_at + interval '44 hours'
    when e.id = '00000000-0000-4000-8497-000000000202' then now() + interval '3 hours'
    when e.id = '00000000-0000-4000-8497-000000000203' then e.starts_at - interval '2 hours'
    when e.id = '00000000-0000-4000-8497-000000000211' then now() + interval '30 hours'
    when e.id = '00000000-0000-4000-8497-000000000212' then now() - interval '30 minutes'
    when e.id = '00000000-0000-4000-8497-000000000213' then now() - interval '90 minutes'
    else e.starts_at + interval '4 hours'
  end
from public.events e
where e.id not in ('00000000-0000-4000-8497-000000000101',
                   '00000000-0000-4000-8497-000000000209',
                   '00000000-0000-4000-8497-000000000210')
on conflict (event_id) do update set ends_at = excluded.ends_at;

-- La fidel va a tot.
insert into public.attendances (user_id, event_id, estado)
select tests.uid('r497_fidel'), id, 'asistio' from public.events;

-- La despenjada va a les sis primeres setmanals i a la del mateix minut, i para.
insert into public.attendances (user_id, event_id, estado)
select tests.uid('r497_despenjat'), id, 'asistio' from public.events
 where id in (select ('00000000-0000-4000-8497-0000000001' || lpad(g::text, 2, '0'))::uuid
                from generate_series(1, 6) g)
    or id = '00000000-0000-4000-8497-000000000201';

-- Un estat de cada a les setmanals: tres no compten, la resta compta com a no
-- haver-hi anat, i `asistio` és l'única que diu que sí.
insert into public.attendances (user_id, event_id, estado)
select tests.uid('r497_estats'),
       ('00000000-0000-4000-8497-0000000001' || lpad(g::text, 2, '0'))::uuid,
       (array['asistio', 'si', 'potser', 'no', 'espera', 'cancelado', 'sollicitat', 'rebutjat'])[g]
from generate_series(1, 8) g;

-- ── la ratxa ────────────────────────────────────────────────────────────────
-- Fila a fila i en ordre, per a cadascuna. Un `array(...)` i no un `except`
-- perquè l'ordre també és part del que `my_streak()` llegeix.
create temporary table persones as
select handle, uid from tests.persona
 where handle in ('r497_fidel', 'r497_despenjat', 'r497_nova', 'r497_mai', 'r497_estats');

select is(
  array(select row(r.*)::text from private.streak_rows(p.uid) r),
  array(select row(r.*)::text from pg_temp.old_streak_rows(p.uid) r),
  'la ratxa de ' || p.handle || ' és la mateixa fila a fila'
)
from persones p
order by p.handle;

select is(
  (select count(*)::int from private.streak_rows('00000000-0000-4000-8497-0000000000ff')),
  0,
  'i d''algú que no existeix, cap fila, com abans'
);

-- Que la comparació no sigui buida: dotze activitats compten per a la fidel
-- (les vuit setmanals, la del mateix minut, la reunió de tothom i les dues que
-- han tancat fa mitja hora) i cap de les que no han de comptar s'hi cola.
select is(
  (select count(*)::int from private.streak_rows(tests.uid('r497_fidel'))),
  12,
  'la fidel té dotze activitats comptables'
);

select is(
  array(select r.event_id from private.streak_rows(tests.uid('r497_fidel')) r
         where r.event_id in ('00000000-0000-4000-8497-000000000202',
                              '00000000-0000-4000-8497-000000000203',
                              '00000000-0000-4000-8497-000000000204',
                              '00000000-0000-4000-8497-000000000206',
                              '00000000-0000-4000-8497-000000000207',
                              '00000000-0000-4000-8497-000000000208',
                              '00000000-0000-4000-8497-000000000210',
                              '00000000-0000-4000-8497-000000000211',
                              '00000000-0000-4000-8497-000000000212')),
  '{}'::uuid[],
  'ni l''oberta, ni el rang buit, ni la de junta, ni l''amagada, ni la futura, ni la d''abans de ser-hi, ni la que encara no ha tancat'
);

select is(
  (select count(*)::int from private.streak_rows(tests.uid('r497_estats')) r
    where r.event_id::text like '00000000-0000-4000-8497-0000000001%'),
  5,
  'espera, sol·licitat i rebutjat no compten, i la resta sí'
);

-- ── els despenjats ──────────────────────────────────────────────────────────
create temporary table finestres as
select * from (values
  ('tot',         null::timestamptz,           null::timestamptz),
  ('des_de',      now() - interval '30 days',  null),
  ('fins_a',      null,                        now() - interval '10 days'),
  ('entremig',    now() - interval '60 days',  now() - interval '5 days'),
  ('buida',       now() + interval '1 year',   now() + interval '2 years')
) f(codi, f, t);

select is(
  private.drifting(p.uid, w.f, w.t),
  pg_temp.old_drifting(p.uid, w.f, w.t),
  'drifting de ' || p.handle || ' a la finestra ' || w.codi
)
from persones p
cross join finestres w
where w.codi in ('tot', 'entremig')
order by p.handle, w.codi;

select ok(
  private.drifting(tests.uid('r497_despenjat'), null, null),
  'i la despenjada surt com a despenjada: la comparació no és entre dos falsos'
);

select is(
  pg_temp.new_despenjats(w.f, w.t),
  pg_temp.old_despenjats(w.f, w.t),
  'els despenjats del tauler, finestra ' || w.codi
)
from finestres w
order by w.codi;

-- ── el rànquing d'escoles ───────────────────────────────────────────────────
-- Punts de tota mena: assistència, muntatge apuntat tard (la data és la de
-- l'esdeveniment), ajustos a mà sense esdeveniment i negatius, un avís i la
-- seva retirada, i punts de gent que no compta.
insert into public.points_log (user_id, event_id, motivo, puntos, created_at)
values
  (tests.uid('alfa'),  '00000000-0000-4000-8497-000000000103', 'asistencia', 10, now() - interval '35 days'),
  (tests.uid('bravo'), '00000000-0000-4000-8497-000000000103', 'asistencia', 10, now() - interval '35 days'),
  (tests.uid('alfa'),  '00000000-0000-4000-8497-000000000103', 'montaje',    20, now()),
  (tests.uid('kilo'),  '00000000-0000-4000-8497-000000000107', 'asistencia', 10, now() - interval '13 days');

insert into public.points_log (user_id, motivo, puntos, nota, created_at)
values
  (tests.uid('alfa'),  'manual',       -5, 'ajust', now() - interval '20 days'),
  (tests.uid('echo'),  'manual',       15, 'ajust', now() - interval '40 days'),
  (tests.uid('delta'), 'avis',        -25, 'avis',  now() - interval '50 days'),
  (tests.uid('delta'), 'avis_retirat', 25, 'torna', now() - interval '3 days'),
  (tests.uid('hidden_alfa'), 'manual',  7, 'ajust', now() - interval '20 days'),
  -- De baixa i pendent, amb escola i molts punts: no compten enlloc.
  (tests.uid('baixa_alfa'),   'manual', 100, 'ajust', now() - interval '20 days'),
  (tests.uid('pendent_alfa'), 'manual', 100, 'ajust', now() - interval '20 days');

update public.profiles set escola = 'politecnica' where id = tests.uid('baixa_alfa');
update public.profiles set escola = 'empresa'     where id = tests.uid('pendent_alfa');

-- L'EMPAT: tres punts a cada soci actiu de dues escoles en una activitat
-- pròpia, i un a cada soci de la tercera. Mitjanes iguals amb plantilles
-- diferents.
insert into public.events (id, tipo, starts_at, puntos, published)
values ('00000000-0000-4000-8497-000000000301', 'actividad', now() - interval '90 days', 3, true);

insert into public.points_log (user_id, event_id, motivo, puntos, created_at)
select p.id, '00000000-0000-4000-8497-000000000301', 'montaje',
       case when p.escola = 'salut' then 1 else 3 end, now()
from public.profiles p
where p.estat = 'actiu' and p.escola is not null;

create temporary table finestres_ranking as
select codi, f, t from finestres
union all select 'empat', now() - interval '91 days', now() - interval '89 days'
-- Mig obert just a l'inici d'una activitat: hi entra des d'un costat i no des
-- de l'altre.
union all select 'vora_inclosa',
  (select starts_at from public.events where id = '00000000-0000-4000-8497-000000000103'), null
union all select 'vora_exclosa', null,
  (select starts_at from public.events where id = '00000000-0000-4000-8497-000000000103');

select results_eq(
  format('select * from public.ranking_escoles_period(%L, %L) order by escola', w.f, w.t),
  format('select * from pg_temp.old_ranking_escoles_period(%L, %L) order by escola', w.f, w.t),
  'rànquing d''escoles, finestra ' || w.codi
)
from finestres_ranking w
order by w.codi;

select is(
  (select array_agg(posicio order by escola)
     from public.ranking_escoles_period(now() - interval '91 days', now() - interval '89 days')),
  array[1, 1, 3],
  'l''empat és un empat de debò, i la comparació de dalt el cobreix'
);

-- Per sota de tres socis una escola no surt, abans ni ara.
update public.profiles set estat = 'baixa'
 where escola = 'salut'
   and id not in (tests.uid('charlie'), tests.uid('junta_charlie'));

select results_eq(
  'select * from public.ranking_escoles_period(null, null) order by escola',
  'select * from pg_temp.old_ranking_escoles_period(null, null) order by escola',
  'amb una escola de dos socis, el mateix rànquing'
);

select is(
  (select count(*)::int from public.ranking_escoles_period(null, null) where escola = 'salut'),
  0,
  'i l''escola de dos no hi és'
);

-- ── un rang al revés és un error, abans i ara ───────────────────────────────
-- Un final més de dues hores abans del començament no és una finestra. La
-- funció d'abans fallava i la d'ara també: callar-ho seria amagar una dada
-- dolenta darrere una ratxa que sembla bona.
update public.event_details set ends_at = e.starts_at - interval '5 hours'
  from public.events e
 where e.id = event_details.event_id
   and e.id = '00000000-0000-4000-8497-000000000103';

select throws_ok(
  format('select count(*) from pg_temp.old_streak_rows(%L)', tests.uid('r497_fidel')),
  '22000',
  null,
  'la ratxa d''abans falla amb un rang al revés'
);

select throws_ok(
  format('select count(*) from private.streak_rows(%L)', tests.uid('r497_fidel')),
  '22000',
  null,
  'i la d''ara també'
);

select * from finish();
rollback;

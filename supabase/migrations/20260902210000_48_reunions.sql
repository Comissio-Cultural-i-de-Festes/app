-- Les reunions: un quart tipus d'esdeveniment, amb un àmbit.
--
-- PER QUÈ UN VALOR DE `tipo` I NO UN BOOLEÀ MÉS. Aquest repositori ha evitat
-- dues vegades ampliar `tipo` i hi ha posat una columna: `cal_confirmacio`
-- (migració 27, «la regla és "aquest necessita decidir-se", i això és una
-- propietat del vespre, no d'una categoria») i `te_cotxes` (migració 31, «pel
-- mateix motiu»). Aquí no aplica. Una reunió no és una festa amb un
-- interruptor posat: no té places, ni preu, ni portada, ni cotxes, i el que
-- demana no és «hi véns?» sinó «hi pots ser?». És una altra cosa, i les altres
-- coses són valors de `tipo`.
--
-- `abast` SÍ QUE ÉS UNA PROPIETAT, i per això és columna a part: la mateixa
-- reunió pot ser de junta o de tota la comi sense deixar de ser una reunió.
--
-- EL FILTRE VIU A LA POLÍTICA I NO A REACT. «Els socis no la veuen ni
-- sabent-ne l'enllaç» només és cert si ho diu Postgres. Un `if` al client
-- deixa la resposta a la pestanya de xarxa, que és el mateix error que la
-- migració 44 acaba d'arreglar amb el títol.
--
-- ── DEPARTURE FROM THE DESIGN ──────────────────────────────────────────────
-- El dibuix ensenya «Punts per venir-hi: 5» en un formulari amb «Només la
-- junta» triat. No es fa: una reunió de junta no reparteix cap punt.
--
-- El motiu és de justícia i el va donar el mantenidor: «les reunions que són
-- només de junta no haurien d'afegir punts ni ratxes a la gent que va ni tocar
-- les ratxes de la gent que no va, ja que seria injust per a la gent fora de
-- junta». Les dues meitats compten:
--
--   · No afegir punts ni ratxes a qui hi va. `admin_close_meeting` no escriu
--     cap fila a `points_log` quan l'àmbit és `junta`. Sí que marca
--     l'assistència, perquè l'acta i el recompte «2 de 3 hi eren» ho
--     necessiten.
--
--   · No tocar les ratxes de qui no hi va. Aquesta és la meitat que costa
--     veure: `private.streak_rows` compta TOT esdeveniment publicat i passat
--     per a TOTHOM, i per tant una reunió de junta seria una activitat que
--     cada soci de fora consta com a no haver-hi anat. Amb tres reunions al
--     mes, la ratxa de tota l'associació es trenca per reunions a què ningú no
--     podia venir. `abast <> 'junta'` a `streak_rows` és el que ho evita, i és
--     el canvi més important d'aquesta migració.
--
-- I LES INSÍGNIES: cap reunió hi compta, ni les de comi. `private.grant_badges`
-- compta assistències i `count(distinct tipo)`; amb les reunions dins, «de_tot»
-- (tres menes) es podria guanyar amb festa + reunió + activitat, cosa que
-- canvia el que significa una insígnia que hi ha gent que ja té. Les insígnies
-- són la vida social de l'associació; una reunió és feina.

-- ── el tipus i l'àmbit ──────────────────────────────────────────────────────
alter table public.events drop constraint events_tipo_check;
alter table public.events add constraint events_tipo_check
  check (tipo in ('fiesta', 'casa_rural', 'actividad', 'reunio'));

alter table public.events add column abast text not null default 'comi'
  check (abast in ('comi', 'junta'));

comment on column public.events.abast is
  'Qui hi ha de venir. `junta` no surt a l''Inici de ningú i els socis no la '
  'veuen ni sabent-ne l''enllaç: ho filtra events_select_member, no React. '
  'Només té sentit amb tipo = ''reunio'', i per als altres tipus es queda al '
  'valor per defecte.';

alter table public.events add column tancada_at timestamptz;

comment on column public.events.tancada_at is
  'Quan la junta va tancar la reunió i repartir els punts. És també el que fa '
  'visible l''acta: abans no n''hi ha cap.';

-- L'acta va a `event_details`, que la revelació ja filtra. No fa falta cap
-- predicat nou per a «visible només quan està tancada»: l'acta és NULL fins
-- que la junta l'escriu en tancar, i una reunió es tanca després de passar.
alter table public.event_details add column acta text;

comment on column public.event_details.acta is
  'Quatre línies de què s''ha decidit, per a qui no hi era. Opcional: si es '
  'deixa en blanc la reunió es tanca igual i el bloc no surt a ningú.';

-- Els punts per defecte d'una reunió, a l'escala com la resta.
insert into public.point_values (mena, clau, punts, ordre)
values ('tipus_esdeveniment', 'reunio', 5, 40)
on conflict (mena, clau) do nothing;

-- ── qui veu què ─────────────────────────────────────────────────────────────
drop policy events_select_member on public.events;

create policy events_select_member on public.events
  for select to authenticated
  using (
    (select private.is_member_or_pending())
    and published
    -- «No surt a l'Inici de ningú. Els socis no la veuen ni sabent-ne
    -- l'enllaç.» Els admins hi arriben per `events_select_admin`, que ja hi és.
    and abast <> 'junta'
  );

comment on table public.events is
  'The always-public half of an event: enough for a teaser and a countdown. '
  'Readable by members AND by people still waiting for approval, which is what '
  'the door promises them. Everything that has to stay hidden until reveal_at '
  'lives in event_details and event_title. A reunion with abast = ''junta'' is '
  'not readable by a member at all, not even by id.';

-- ── la ratxa: una reunió de junta no és una activitat de ningú ──────────────
-- El canvi és una línia i és el que fa que això sigui just. Sense ella, cada
-- reunió de junta és una activitat que tots els socis de fora consten com a no
-- haver-hi anat.
create or replace function private.streak_rows(p_user uuid)
returns table(event_id uuid, starts_at timestamptz, hi_va_anar boolean)
language sql
stable
security definer
set search_path = ''
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
    -- El que passava abans que fossis soci no és teu.
    and e.starts_at >= p.created_at
    and coalesce(a.estado, 'no') not in ('espera', 'sollicitat', 'rebutjat')
    -- I una reunió de junta no és una activitat a què ningú de fora pogués
    -- venir: comptar-la trencaria la ratxa de tota l'associació per una cosa
    -- que no els va passar. Migració 48.
    and e.abast <> 'junta'
  -- L'id desempata: dues activitats el mateix minut han de sortir sempre en el
  -- mateix ordre, o la ratxa canviaria de valor entre dues crides iguals.
  order by e.starts_at, e.id
$$;

alter function private.streak_rows(uuid) owner to postgres;
revoke all on function private.streak_rows(uuid) from public, anon, authenticated;

-- ── i les insígnies: cap reunió hi compta ───────────────────────────────────
-- `count(distinct tipo)` és el que ho obliga: amb `reunio` com a quarta mena,
-- «de_tot» es podria guanyar amb festa + reunió + activitat i canviaria el que
-- significa per a qui ja la té.
create or replace function private.grant_badges(p_user uuid)
returns setof text
language sql
security definer
set search_path = ''
as $$
  with fets as (
    select a.event_id, e.tipo, a.entry_photo_url, a.exit_photo_url
    from public.attendances a
    join public.events e on e.id = a.event_id
    where a.user_id = p_user
      and a.estado = 'asistio'
      -- Les insígnies són la vida social de l'associació. Una reunió és feina,
      -- i comptar-la canviaria «de_tot» —que compta menes— i els llindars de
      -- «cinc», «deu» i «vint-i-cinc» per a tothom que ja les té. Migració 48.
      and e.tipo <> 'reunio'
  ),
  quants as (
    select count(*)::int as n, count(distinct tipo)::int as menes from fets
  ),
  guanyades as (
              select 'primera'::text as codi from quants where n >= 1
    union all select 'cinc'                  from quants where n >= 5
    union all select 'deu'                   from quants where n >= 10
    union all select 'vint_i_cinc'           from quants where n >= 25
    union all select 'de_tot'                from quants where menes >= 3

    union all select 'cap_de_setmana' where exists (
                select 1 from fets where tipo = 'casa_rural')

    union all select 'entrada_i_sortida' where exists (
                select 1 from fets
                 where entry_photo_url is not null and exit_photo_url is not null)

    union all select 'a_muntar' where exists (
                select 1 from public.points_log
                 where user_id = p_user and motivo = 'montaje' and puntos > 0)

    union all select 'va_ser_idea_meva' where exists (
                select 1 from public.proposals
                 where user_id = p_user and estat = 'acceptada')

    -- La font és el cotxe i no `points_log`, encara que hi hagi un motiu
    -- `conduir` des de la migració 15: aquells punts els ha de donar la junta
    -- a mà i no els ha donat mai ningú. Una insígnia que depengui de si algú
    -- se'n va recordar no premia haver conduït, premia haver tingut sort.
    -- I amb algú a dins: un cotxe ofert i buit no és haver portat ningú.
    union all select 'al_volant' where exists (
                select 1 from public.rides r
                  join public.ride_seats s on s.ride_id = r.id
                 where r.driver_id = p_user
                   and s.estat = 'a_dins'
                   and s.user_id <> r.driver_id)

    union all select 'copilot' where exists (
                select 1 from public.ride_seats s
                  join public.rides r on r.id = s.ride_id
                 where s.user_id = p_user
                   and s.estat = 'a_dins'
                   and r.driver_id <> p_user)

    -- Dels cinc primers a fitxar, i només en activitats amb deu fitxatges o
    -- més. Sense aquest terra, una activitat de quatre persones les faria «de
    -- les primeres» a totes quatre i la insígnia no voldria dir res.
    union all select 'de_les_primeres' where exists (
                select 1 from public.attendances a
                 where a.user_id = p_user
                   and a.estado = 'asistio'
                   and a.checked_in_at is not null
                   and (select count(*) from public.attendances b
                         where b.event_id = a.event_id
                           and b.checked_in_at is not null) >= 10
                   and (select count(*) from public.attendances b
                         where b.event_id = a.event_id
                           and b.checked_in_at is not null
                           and b.checked_in_at < a.checked_in_at) < 5)
  )
  insert into public.badges (user_id, codi, event_id)
  select p_user, codi, private.badge_event(p_user, codi) from guanyades
  on conflict (user_id, codi) do nothing
  returning codi
$$;

alter function private.grant_badges(uuid) owner to postgres;
revoke all on function private.grant_badges(uuid) from public, anon, authenticated;

-- ── convocar-la: `admin_save_event` guanya l'àmbit ──────────────────────────
-- Drop i recrear i no `create or replace`: afegir un paràmetre amb valor per
-- defecte crea una sobrecàrrega nova i PostgREST contesta PGRST203. Ja ha
-- passat dues vegades amb aquesta mateixa funció (migracions 27 i 32).
drop function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean
);

create function public.admin_save_event(
  p_titulo text,
  p_tipo text,
  p_starts_at timestamptz,
  p_id uuid default null,
  p_plazas int default null,
  p_precio_cents int default 0,
  p_puntos int default null,
  p_teaser text default null,
  p_reveal_at timestamptz default null,
  p_published boolean default false,
  p_descripcion text default null,
  p_ubicacion text default null,
  p_ends_at timestamptz default null,
  p_cover_url text default null,
  p_transport_info text default null,
  p_cal_confirmacio boolean default false,
  p_te_cotxes boolean default false,
  p_abast text default 'comi'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_puntos  int  := p_puntos;
  v_abast   text := coalesce(p_abast, 'comi');
  v_before  jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_tipo not in ('fiesta', 'casa_rural', 'actividad', 'reunio') then
    raise exception 'tipus invalid' using errcode = '22023';
  end if;
  if v_abast not in ('comi', 'junta') then
    raise exception 'abast invalid' using errcode = '22023';
  end if;
  -- L'àmbit només vol dir alguna cosa en una reunió. Una festa «només per a la
  -- junta» seria una cosa que ningú no ha dissenyat i que la pantalla no sap
  -- ensenyar; val més refusar-la que deixar-la mig feta.
  if v_abast = 'junta' and p_tipo <> 'reunio' then
    raise exception 'nomes una reunio pot ser d''abast junta' using errcode = '22023';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'cal un titol' using errcode = '22023';
  end if;

  -- Only for a new event. Changing the scale later must never restate what an
  -- evening that already happened was worth.
  if v_puntos is null then
    select punts into v_puntos
      from public.point_values
     where mena = 'tipus_esdeveniment' and clau = p_tipo;
    v_puntos := coalesce(v_puntos, 10);
  end if;

  -- Una reunió de junta no reparteix punts, i per tant no en guarda: deixar-hi
  -- un número seria una promesa que en tancar-la no es compleix. Vegeu la nota
  -- de dalt.
  if v_abast = 'junta' then
    v_puntos := 0;
  end if;

  if v_id is null then
    insert into public.events (
      tipo, starts_at, plazas, precio_cents, puntos,
      teaser, reveal_at, published, cal_confirmacio, te_cotxes, abast, created_by
    )
    values (
      p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, coalesce(p_cal_confirmacio, false),
      coalesce(p_te_cotxes, false), v_abast, (select auth.uid())
    )
    returning id into v_id;
  else
    select to_jsonb(e) into v_before from public.events e where e.id = v_id;
    if v_before is null then
      raise exception 'esdeveniment inexistent' using errcode = '42501';
    end if;

    update public.events set
      tipo = p_tipo, starts_at = p_starts_at,
      plazas = p_plazas, precio_cents = p_precio_cents, puntos = v_puntos,
      teaser = p_teaser, reveal_at = p_reveal_at, published = p_published,
      cal_confirmacio = coalesce(p_cal_confirmacio, false),
      te_cotxes = coalesce(p_te_cotxes, false),
      abast = v_abast
    where id = v_id;
  end if;

  -- El titol a la seva taula i la resta a la seva, dins de la mateixa
  -- transaccio: el que no pot passar es que un esdeveniment quedi publicat amb
  -- titol i sense detalls, o al contrari.
  insert into public.event_title (event_id, titulo)
  values (v_id, btrim(p_titulo))
  on conflict (event_id) do update set titulo = excluded.titulo;

  insert into public.event_details (
    event_id, descripcion, ubicacion, ends_at, cover_url, transport_info
  )
  values (v_id, p_descripcion, p_ubicacion, p_ends_at, p_cover_url, p_transport_info)
  on conflict (event_id) do update set
    descripcion    = excluded.descripcion,
    ubicacion      = excluded.ubicacion,
    ends_at        = excluded.ends_at,
    cover_url      = excluded.cover_url,
    transport_info = excluded.transport_info;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    case when p_id is null then 'create_event' else 'edit_event' end,
    v_id,
    jsonb_build_object(
      'titulo', p_titulo, 'published', p_published, 'reveal_at', p_reveal_at,
      'cal_confirmacio', coalesce(p_cal_confirmacio, false),
      'te_cotxes', coalesce(p_te_cotxes, false),
      'tipo', p_tipo, 'abast', v_abast
    )
  );

  return v_id;
end $$;

comment on function public.admin_save_event is
  'One call for the event and its two reveal-gated halves. Since migration 48 '
  'it also takes the scope: only a reunio may be junta-scoped, and a '
  'junta-scoped one is stored with zero points because closing it awards none.';

alter function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) owner to postgres;
revoke all on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) from public, anon;
grant execute on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) to authenticated;

-- ── tancar-la, i repartir els punts ─────────────────────────────────────────
-- ELS PUNTS NO ELS DÓNA CAP QR I MAI EN CONFIRMAR L'ASSISTÈNCIA. «Qui diu que
-- hi serà i no hi és, no en fa»: el que compta és qui hi era de debò, i això
-- només ho sap qui tanca la reunió. Per això no hi ha cap camí que doni punts
-- d'una reunió des de la porta.
--
-- UNA SOLA TRANSACCIÓ per a tota la llista, i és la primera vegada al
-- repositori que els punts es reparteixen en bloc: `src/features/door/api.ts`
-- ho fa amb una crida per persona a posta, perquè `award_points` és la unitat
-- auditada i un error a mig camí ha de deixar els quatre primers cobrats. Una
-- reunió és el cas contrari: es tanca una vegada, i quedar-se a mitges voldria
-- dir una reunió tancada amb la meitat de la gent pagada i sense manera de
-- saber quina meitat.
--
-- IDEMPOTENT DE FRANC. `points_log_asistencia_unic` és un índex únic parcial
-- sobre `(user_id, event_id) where motivo = 'asistencia'`, i per tant
-- `on conflict do nothing` fa que tornar a tancar-la no pagui dues vegades.
-- Aquell índex el pinsa `010_structure.test.sql` amb el seu `indexdef`
-- literal; això se n'aprofita i no el toca.
create or replace function public.admin_close_meeting(
  p_event_id uuid,
  p_user_ids uuid[],
  p_acta text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_event  public.events%rowtype;
  v_punts  int := 0;
  v_gent   int := 0;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;
  if v_event.tipo <> 'reunio' then
    raise exception 'nomes es tanquen reunions' using errcode = '22023';
  end if;

  -- Qui hi era. `on conflict` perquè la majoria ja hi tindran una fila del
  -- «hi seré», i el que canvia és l'estat.
  insert into public.attendances (user_id, event_id, estado)
  select u, p_event_id, 'asistio'
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
  on conflict (user_id, event_id) do update set estado = 'asistio';

  -- I qui NO hi era torna a 'no', perquè tancar-la dues vegades amb una llista
  -- diferent ha de deixar l'estat que diu la segona: sense això, treure algú de
  -- la llista el deixaria comptant com a assistent.
  update public.attendances
     set estado = 'no'
   where event_id = p_event_id
     and estado = 'asistio'
     and not (user_id = any (coalesce(p_user_ids, '{}'::uuid[])));

  select count(*)::int into v_gent
    from public.attendances
   where event_id = p_event_id and estado = 'asistio';

  -- Els punts, només si la reunió és de tota la comi. Una de junta no en
  -- reparteix: vegeu la nota de dalt del fitxer.
  if v_event.abast = 'comi' and v_event.puntos > 0 then
    insert into public.points_log (user_id, event_id, motivo, puntos, granted_by)
    select u, p_event_id, 'asistencia', v_event.puntos, v_actor
      from unnest(coalesce(p_user_ids, '{}'::uuid[])) as u
    on conflict do nothing;

    select count(*)::int * v_event.puntos into v_punts
      from public.points_log
     where event_id = p_event_id and motivo = 'asistencia';
  end if;

  -- L'acta i la marca de tancada. En blanc es queda en blanc: «si la deixes en
  -- blanc, la reunió es tanca igual i el bloc de l'acta no surt a ningú».
  insert into public.event_details (event_id, acta)
  values (p_event_id, nullif(btrim(coalesce(p_acta, '')), ''))
  on conflict (event_id) do update set acta = excluded.acta;

  update public.events set tancada_at = now() where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    v_actor,
    'close_meeting',
    p_event_id,
    jsonb_build_object(
      'abast', v_event.abast,
      'hi_eren', v_gent,
      'punts_per_persona', case when v_event.abast = 'comi' then v_event.puntos else 0 end,
      'amb_acta', nullif(btrim(coalesce(p_acta, '')), '') is not null
    )
  );

  return jsonb_build_object('hi_eren', v_gent, 'punts', v_punts);
end $$;

comment on function public.admin_close_meeting(uuid, uuid[], text) is
  'Marca qui hi era, reparteix els punts i desa l''acta, tot en una '
  'transacció. Els punts es donen en tancar i no en confirmar: qui diu que hi '
  'serà i no hi és, no en fa. Una reunió d''abast junta no en reparteix cap.';

alter function public.admin_close_meeting(uuid, uuid[], text) owner to postgres;
revoke all on function public.admin_close_meeting(uuid, uuid[], text) from public, anon;
grant execute on function public.admin_close_meeting(uuid, uuid[], text) to authenticated;

-- ── qui ha dit que hi serà ──────────────────────────────────────────────────
-- «2 de 3 hi seran», i a una reunió sí que se sap qui NO hi ve: «sou pocs i cal
-- saber si hi haurà ningú». A una festa la llista pública són només els sí, i
-- aquesta és la diferència que justifica una funció a part en comptes de
-- reutilitzar la de les festes.
create or replace function public.meeting_roster(p_event_id uuid)
returns table(user_id uuid, nombre text, avatar_url text, estado text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.nombre, p.avatar_url, coalesce(a.estado, 'pendent')
    from public.events e
    join public.profiles p
      on p.estat = 'actiu'
     and (e.abast = 'comi' or p.role in ('admin', 'owner'))
    left join public.attendances a on a.event_id = e.id and a.user_id = p.id
   where e.id = p_event_id
     and e.tipo = 'reunio'
     -- Qui pot preguntar-ho: la junta sempre, i un soci només d'una reunió de
     -- comi. Sense això, un soci sabria qui hi ha a la junta i qui hi va.
     and ((select private.is_admin()) or (e.abast = 'comi' and (select private.is_active_member())))
   order by p.nombre
$$;

comment on function public.meeting_roster(uuid) is
  'Qui hi ha de venir a una reunió i què ha dit. A diferència d''una festa, '
  'aquí sí que es veu qui no hi ve: sou pocs i cal saber si es fa. La llista '
  'és la junta per a una reunió de junta i tots els socis actius per a una de '
  'comi.';

alter function public.meeting_roster(uuid) owner to postgres;
revoke all on function public.meeting_roster(uuid) from public, anon;
grant execute on function public.meeting_roster(uuid) to authenticated;

-- ── i la corba del tauler ───────────────────────────────────────────────────
create or replace function public.admin_dashboard(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_despenjats jsonb;
  v_assistencia jsonb;
  v_tipus jsonb;
  v_escoles jsonb;
  v_motius jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  -- El número que justifica la fase, amb prou context per escriure-li: què
  -- feia abans, quan va ser l'última vegada, i el telèfon que la junta ja veu.
  select coalesce(jsonb_agg(x order by x.ultima_at desc nulls last), '[]'::jsonb)
    into v_despenjats
  from (
    select
      p.id,
      p.nombre as nom,
      p.escola,
      p.curs,
      c.telefon,
      (select count(*)::int from private.streak_rows(p.id) r
        where r.hi_va_anar
          and (p_from is null or r.starts_at >= p_from)
          and (p_to is null or r.starts_at < p_to)) as hi_va_anar,
      (select count(*)::int from private.streak_rows(p.id) r
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
      and private.drifting(p.id, p_from, p_to)
  ) x;

  -- Quanta gent per activitat, en ordre. La forma de la corba és el que es
  -- llegeix; els números concrets són per a la frase de sota.
  select coalesce(jsonb_agg(x order by x.starts_at), '[]'::jsonb) into v_assistencia
  from (
    select
      e.id,
      t.titulo,
      e.starts_at,
      e.tipo,
      count(a.id) filter (where a.estado = 'asistio')::int as quants
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.published
      -- Una reunió de junta no va a la corba d'assistència: tres persones en
      -- una aula al costat d'una festa de quaranta no és una comparació, és
      -- soroll. Les de comi sí, que hi podia venir tothom. Migració 48.
      and e.abast <> 'junta'
      and e.starts_at < now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
    group by e.id, t.titulo, e.starts_at, e.tipo
  ) x;

  -- Quin tipus funciona. La mitjana i si s'omple: una casa rural de divuit
  -- places sempre plena no és menys popular que una festa de quaranta, i sense
  -- la segona xifra la primera diu justament el contrari.
  select coalesce(jsonb_agg(x order by x.mitjana desc), '[]'::jsonb) into v_tipus
  from (
    select
      e.tipo,
      count(distinct e.id)::int as quantes,
      round(avg(f.quants), 1) as mitjana,
      bool_and(e.plazas is not null and f.quants >= e.plazas) as sempre_plena
    from public.events e
    join lateral (
      select count(a.id) filter (where a.estado = 'asistio')::int as quants
      from public.attendances a where a.event_id = e.id
    ) f on true
    where e.published
      and e.starts_at < now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
    group by e.tipo
  ) x;

  -- Les tres escoles. «Actius» és haver vingut a alguna cosa els últims trenta
  -- dies, i és el número que diu on comencen les trucades.
  select coalesce(jsonb_agg(x order by x.punts desc), '[]'::jsonb) into v_escoles
  from (
    select
      p.escola,
      count(*)::int as socis,
      count(*) filter (where exists (
        select 1 from public.attendances a
        join public.events e on e.id = a.event_id
        where a.user_id = p.id and a.estado = 'asistio'
          and e.starts_at >= now() - interval '30 days'))::int as actius,
      coalesce((
        select sum(l.puntos)::int from public.points_log l
        join public.profiles q on q.id = l.user_id
        where q.escola = p.escola
          and (p_from is null or l.created_at >= p_from)
          and (p_to is null or l.created_at < p_to)), 0) as punts
    from public.profiles p
    where p.estat = 'actiu' and p.escola is not null
    group by p.escola
  ) x;

  -- D'on surten els punts. En percentatges perquè el total no diu res: el que
  -- es llegeix és que gairebé tot ve d'assistir, i per tant que muntar i
  -- conduir són punts fàcils de repartir al gener.
  select coalesce(jsonb_agg(x order by x.punts desc), '[]'::jsonb) into v_motius
  from (
    select
      l.motivo,
      sum(l.puntos)::int as punts,
      count(*)::int as vegades
    from public.points_log l
    where l.puntos > 0
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
    group by l.motivo
  ) x;

  return jsonb_build_object(
    'despenjats', v_despenjats,
    'assistencia', v_assistencia,
    'per_tipus', v_tipus,
    'escoles', v_escoles,
    'punts_per_motiu', v_motius
  );
end;
$$;

alter function public.admin_dashboard(timestamptz, timestamptz) owner to postgres;
revoke all on function public.admin_dashboard(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_dashboard(timestamptz, timestamptz) to authenticated;

-- ── i la vista, amb les tres columnes noves al final ────────────────────────
-- `create or replace view` només sap AFEGIR columnes, i afegir-les al final és
-- exactament el que es pot fer: així no cal el drop, i el drop se'n duria els
-- grants i tot el que la llegeix. La migració 44 sí que va haver de fer-lo,
-- perquè allà el títol es MOVIA de lloc.
create or replace view public.events_public
with (security_invoker = true, security_barrier = true) as
select
  e.id,
  t.titulo,
  e.tipo,
  e.starts_at,
  e.teaser,
  e.reveal_at,
  (e.reveal_at is null or e.reveal_at <= now()) as revelat,
  e.plazas,
  e.precio_cents,
  e.puntos,
  e.published,
  e.created_by,
  e.created_at,
  d.descripcion,
  d.ubicacion,
  d.ends_at,
  d.cover_url,
  d.transport_info,
  e.cal_confirmacio,
  e.te_cotxes,
  e.abast,
  e.tancada_at,
  -- L'acta va amb els detalls, o sigui que la revelació ja la filtra. I és
  -- NULL fins que la junta l'escriu en tancar la reunió, que és el que fa que
  -- «visible només quan està tancada» no necessiti cap predicat nou.
  d.acta
from public.events e
left join public.event_title t on t.event_id = e.id
left join public.event_details d on d.event_id = e.id;

alter view public.events_public owner to postgres;

-- ── i el títol, que tenia la seva pròpia porta ──────────────────────────────
-- LA CAPA D'RLS HO VA TROBAR I EL SQL NO PODIA. `etitle_select_member`
-- (migració 44) demana `is_member_or_pending()` i `event_is_revealed()`, i una
-- reunió no té `reveal_at`: per tant estava revelada des del primer moment i un
-- soci podia llegir el títol d'una reunió de junta demanant-lo per
-- identificador, encara que l'esdeveniment sencer li quedés invisible.
--
-- Els tests de dins de la base no ho veien perquè cada un comprova la taula que
-- li toca; el que ho va ensenyar és la prova que demana les quatre portes de
-- cop a través de PostgREST. És el motiu pel qual aquella capa existeix.
--
-- `event_details` no té el problema: demana `is_active_member()` i, sobretot,
-- una reunió de junta no en té fila fins que algú hi escriu una acta —però la
-- condició s'hi afegeix igualment, perquè «no hi ha fila» és una casualitat i
-- no una regla.
create or replace function private.event_is_junta_only(p_event_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = p_event_id and e.abast = 'junta'
  )
$$;

comment on function private.event_is_junta_only(uuid) is
  'Si un esdeveniment és una reunió que només veu la junta. Les taules filles '
  '—event_title, event_details— l''han de consultar: la seva pròpia condició '
  'de revelació no en sap res, i una reunió no té reveal_at.';

alter function private.event_is_junta_only(uuid) owner to postgres;
revoke all on function private.event_is_junta_only(uuid) from public, anon;
grant execute on function private.event_is_junta_only(uuid) to authenticated;

drop policy etitle_select_member on public.event_title;

create policy etitle_select_member on public.event_title
  for select to authenticated
  using (
    (select private.is_member_or_pending())
    and private.event_is_revealed(event_id)
    and not private.event_is_junta_only(event_id)
  );

drop policy edetails_select_member on public.event_details;

create policy edetails_select_member on public.event_details
  for select to authenticated
  using (
    (select private.is_active_member())
    and private.event_is_revealed(event_id)
    and not private.event_is_junta_only(event_id)
  );

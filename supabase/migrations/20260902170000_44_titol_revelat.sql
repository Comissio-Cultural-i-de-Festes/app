-- El títol d'un esdeveniment no revelat no pot arribar al client.
--
-- EL FORAT, TAL COM ERA. `event_details` va néixer perquè la revelació fos un
-- predicat de fila i no un `CASE` (vegeu el DEPARTURE de la migració 01), i hi
-- van anar la descripció, el lloc, l'hora de final, la portada i el transport.
-- El títol es va quedar a `events`, que té un `grant select` de taula sencera
-- per a `authenticated` i una política que deixa llegir tot esdeveniment
-- publicat a qualsevol soci —i, des de la migració 13, també a qui encara
-- espera l'alta.
--
-- O sigui que «Nit de Cap d'Any a la Nau» es podia llegir tres setmanes abans
-- de la revelació. No per un descuit de la vista: `events_public` és
-- `security_invoker` i no filtra res, i dos llocs del client ja llegien el
-- títol saltant-se-la del tot (`points_log → events(titulo)` al perfil, i
-- `proposals → events(titulo)` a les idees). Amagar-lo a la vista no hauria
-- servit de res: qualsevol podia demanar `events?select=titulo`.
--
-- PER QUÈ NO VA A `event_details`, QUE ÉS ON SEMBLA QUE TOCA. Perquè el títol
-- no té la mateixa audiència que la resta del que la revelació tapa.
-- `edetails_select_member` demana `is_active_member()`, i la migració 13 va
-- decidir expressament que qui espera l'alta veu els esdeveniments —«what the
-- door promises them»— mentre que `event_details` es queda «members only».
-- Posar-hi el títol trauria el títol de tots els esdeveniments a qui està
-- pendent, i la banda de la funció 1 li acaba de prometre que ja pot mirar el
-- calendari. Un calendari sense títols no és un calendari: seria la pantalla
-- del teaser per a tot.
--
-- I ampliar `event_details` a `is_member_or_pending()` tampoc: donaria a qui
-- espera l'alta la descripció, l'adreça i la portada, i això és justament el
-- que `100_pending_sees_events` asserta que no passa. Quan el disseny xoca amb
-- un test que ja hi és, guanya el test.
--
-- Dues audiències diferents amb la mateixa porta volen dues taules, que és
-- exactament el motiu pel qual `event_details` existeix. Per això el títol té
-- la seva, amb una sola columna i una sola política: revelat, i per a socis i
-- pendents.
--
-- LA PORTADA ES QUEDA A `event_details`. El camí no baixa fins que es revela i
-- el que baixa després es difumina al client. No es toca.
--
-- QUÈ ES QUEDA A `events`: `teaser` i `reveal_at`. Són la meitat pública a
-- posta —el teaser existeix precisament per dir alguna cosa mentre el títol no
-- es pot dir.

-- ── la taula del títol ──────────────────────────────────────────────────────
create table public.event_title (
  event_id uuid primary key references public.events (id) on delete cascade,
  titulo   text not null check (btrim(titulo) <> '')
);

comment on table public.event_title is
  'El títol, separat perquè la revelació el tapi. `events` té un grant de '
  'taula sencera i una política que arriba als socis pendents, o sigui que una '
  'columna allà és pública des del dia que s''hi posa. Aquí i no a '
  'event_details perquè el títol sí que l''ha de veure qui espera l''alta, i la '
  'descripció i l''adreça no.';

comment on column public.event_title.titulo is
  'not null i no en blanc: un esdeveniment revelat sense títol seria una fila '
  'buida a l''Inici, i admin_save_event ja refusa el títol en blanc.';

-- El trasllat, abans de treure la columna d'origen.
insert into public.event_title (event_id, titulo)
select e.id, e.titulo from public.events e;

alter table public.event_title enable row level security;

-- Revelat, i per a qui pot veure els esdeveniments —socis i pendents, el
-- mateix conjunt que `events_select_member`. `event_is_revealed` ja inclou
-- `published`.
create policy etitle_select_member on public.event_title
  for select to authenticated
  using (
    (select private.is_member_or_pending())
    and private.event_is_revealed(event_id)
  );

-- La junta sempre: ha de poder llegir el títol del que està preparant.
create policy etitle_select_admin on public.event_title
  for select to authenticated using ((select private.is_admin()));

-- I escriure'l només per la RPC, com la resta: cap grant d'escriptura per a
-- `authenticated`, així que aquestes polítiques no tenen cap camí obert al
-- darrere. Hi són perquè `010_structure` demana que tota taula de `public`
-- tingui RLS i com a mínim una política, i perquè el dia que algú afegeixi un
-- grant la regla ja estigui escrita.
create policy etitle_write_admin on public.event_title
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.event_title from anon, authenticated;
grant select on public.event_title to authenticated;
grant select, insert, update, delete on public.event_title to service_role;

-- La vista abans que la columna: `events_public` la referencia, i
-- `create or replace view` només sap afegir columnes al final —moure-la vol
-- dir drop i create, i el drop se'n duria els grants.
drop view public.events_public;

alter table public.events drop column titulo;

create view public.events_public
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
  e.te_cotxes
from public.events e
left join public.event_title t on t.event_id = e.id
left join public.event_details d on d.event_id = e.id;

comment on view public.events_public is
  'La forma de la llista. El títol i els detalls són NULL fins a reveal_at, '
  'perquè les files d''event_title i d''event_details les filtren les seves '
  'pròpies polítiques i no cap CASE d''aquí. security_invoker = true: aquesta '
  'vista és presentació, no una frontera.';

alter view public.events_public owner to postgres;
revoke all on public.events_public from anon, authenticated;
grant select on public.events_public to authenticated, service_role;

-- ── i tot el que llegia `events.titulo` ─────────────────────────────────────
-- Vuit funcions, totes `security definer`, i per tant totes poden llegir
-- `event_title` sense mirar la revelació: la junta ha de veure el títol del
-- que està preparant, i el propi soci el de les seves fotos i insígnies.
-- L'única cosa que canvia a cada una és d'on ve la columna; la resta del cos
-- és paraula per paraula el que ja hi havia.

create or replace function public.admin_set_published(p_event_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was    boolean;
  v_titulo text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  -- Locked before reading, so two admins tapping the toggle at the same time
  -- cannot both record themselves as the one who changed it.
  select e.published, t.titulo into v_was, v_titulo
  from public.events e
  left join public.event_title t on t.event_id = e.id
  where e.id = p_event_id
  for update of e;

  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  -- No row and no audit entry when nothing changes: a double tap is not two
  -- decisions.
  if v_was is not distinct from p_published then
    return;
  end if;

  update public.events set published = p_published where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'set_published',
    p_event_id,
    jsonb_build_object('titulo', v_titulo, 'de', v_was, 'a', p_published)
  );
end $$;

alter function public.admin_set_published(uuid, boolean) owner to postgres;
revoke all on function public.admin_set_published(uuid, boolean) from public, anon;
grant execute on function public.admin_set_published(uuid, boolean) to authenticated;

create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_points int;
  v_signups int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select t.titulo into v_titulo
    from public.events e
    left join public.event_title t on t.event_id = e.id
   where e.id = p_event_id
     for update of e;

  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  select count(*) into v_points from public.points_log where event_id = p_event_id;

  -- Its own code, because the screen has something specific to say about it:
  -- unpublish instead.
  if v_points > 0 then
    raise exception 'esdeveniment amb punts: %', v_points using errcode = 'P0001';
  end if;

  select count(*) into v_signups from public.attendances where event_id = p_event_id;

  -- Written before the row goes, and with the counts, because after this the
  -- trail is the only place any of it still exists.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'delete_event',
    p_event_id,
    jsonb_build_object('titulo', v_titulo, 'apuntats', v_signups)
  );

  delete from public.events where id = p_event_id;
end $$;

alter function public.admin_delete_event(uuid) owner to postgres;
revoke all on function public.admin_delete_event(uuid) from public, anon;
grant execute on function public.admin_delete_event(uuid) to authenticated;

create or replace function public.junta_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event   public.events%rowtype;
  v_porta   jsonb := null;
  v_pendents int;
  v_esborranys int;
  v_propers int;
  v_socis int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event
  from public.events
  where published
    and starts_at between now() - interval '8 hours' and now() + interval '30 hours'
  order by starts_at
  limit 1;

  if found then
    select jsonb_build_object(
      'id', v_event.id,
      'titulo', t.titulo,
      'starts_at', v_event.starts_at,
      'ubicacion', d.ubicacion,
      'plazas', v_event.plazas,
      'de_pagament', v_event.precio_cents > 0,
      -- Said yes and already through the door are the same set the member
      -- screens count, so the number here and the number there agree.
      'diuen_si', count(*) filter (where a.estado in ('si', 'asistio')),
      'fitxats', count(*) filter (where a.checked_in_at is not null),
      -- Waiting and asked are one number on this screen: from here they are
      -- the same job, which is somebody deciding.
      'esperen', count(*) filter (where a.estado in ('espera', 'sollicitat')),
      'no_pagats', count(*) filter (where a.estado in ('si', 'asistio') and not a.pagado)
    )
    into v_porta
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.event_details d on d.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.id = v_event.id
    group by e.id, t.titulo, d.ubicacion;
  end if;

  select count(*) into v_pendents from public.profiles where estat = 'pendent';
  select count(*) into v_esborranys from public.events where not published;
  select count(*) into v_propers
    from public.events where starts_at >= now() - interval '8 hours';
  select count(*) into v_socis from public.profiles where estat = 'actiu';

  return jsonb_build_object(
    'porta', v_porta,
    'pendents', v_pendents,
    'esborranys', v_esborranys,
    'propers', v_propers,
    'socis', v_socis
  );
end $$;

alter function public.junta_home() owner to postgres;
revoke all on function public.junta_home() from public, anon;
grant execute on function public.junta_home() to authenticated;

create or replace function public.my_photos()
returns TABLE(event_id uuid, titulo text, starts_at timestamptz, entry_photo_url text, exit_photo_url text, checked_in_at timestamptz, exit_photo_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.event_id, t.titulo, e.starts_at, a.entry_photo_url, a.exit_photo_url,
         a.checked_in_at, a.exit_photo_at
  from public.attendances a
  join public.events e on e.id = a.event_id
  left join public.event_title t on t.event_id = e.id
  where a.user_id = (select auth.uid())
    and a.estado = 'asistio'
  order by e.starts_at desc
$$;

alter function public.my_photos() owner to postgres;
revoke all on function public.my_photos() from public, anon;
grant execute on function public.my_photos() to authenticated;

create or replace function public.my_badges()
returns TABLE(codi text, earned_at timestamptz, nova boolean, event_id uuid, titol text, starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  perform private.grant_badges(v_me);

  return query
    select b.codi, b.earned_at, b.seen_at is null, b.event_id, t.titulo, e.starts_at
    from public.badges b
    left join public.events e on e.id = b.event_id
    left join public.event_title t on t.event_id = e.id
    where b.user_id = v_me
    order by b.earned_at desc, b.codi;
end;
$$;

alter function public.my_badges() owner to postgres;
revoke all on function public.my_badges() from public, anon;
grant execute on function public.my_badges() to authenticated;

create or replace function public.admin_reported_photos()
returns TABLE(photo_id uuid, thumb_path text, path text, event_id uuid, titol text, pujada_per text, motiu text, quantes int, despenjada boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id,
    f.thumb_path,
    f.path,
    f.event_id,
    t.titulo,
    p.nombre,
    -- El motiu més greu de tots els que hi ha, no el primer que va arribar:
    -- «hi surto i no vull sortir-hi» decideix, encara que algú altre hagi dit
    -- abans que la foto no és d'aquella nit. L'ordre es tria amb un número i
    -- se'n torna l'etiqueta, perquè el que la pantalla ensenya és el motiu.
    (array['hi_surto', 'no_es_d_aquella_nit', 'altra'])[
      min(case r.motiu when 'hi_surto' then 1 when 'no_es_d_aquella_nit' then 2 else 3 end)],
    count(*)::int,
    f.hidden_at is not null
  from public.photo_reports r
  join public.event_photos f on f.id = r.photo_id
  join public.events e on e.id = f.event_id
  left join public.event_title t on t.event_id = e.id
  join public.profiles p on p.id = f.user_id
  where r.resolt_at is null
    and (select private.is_admin())
  group by f.id, f.thumb_path, f.path, f.event_id, t.titulo, p.nombre, f.hidden_at
  order by min(r.created_at)
$$;

alter function public.admin_reported_photos() owner to postgres;
revoke all on function public.admin_reported_photos() from public, anon;
grant execute on function public.admin_reported_photos() to authenticated;

create or replace function public.admin_save_event(p_titulo text, p_tipo text, p_starts_at timestamptz, p_id uuid default null, p_plazas int default null, p_precio_cents int default 0, p_puntos int default null, p_teaser text default null, p_reveal_at timestamptz default null, p_published boolean default false, p_descripcion text default null, p_ubicacion text default null, p_ends_at timestamptz default null, p_cover_url text default null, p_transport_info text default null, p_cal_confirmacio boolean default false, p_te_cotxes boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_puntos  int  := p_puntos;
  v_before  jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_tipo not in ('fiesta', 'casa_rural', 'actividad') then
    raise exception 'tipus invalid' using errcode = '22023';
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

  if v_id is null then
    insert into public.events (
      tipo, starts_at, plazas, precio_cents, puntos,
      teaser, reveal_at, published, cal_confirmacio, te_cotxes, created_by
    )
    values (
      p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, coalesce(p_cal_confirmacio, false),
      coalesce(p_te_cotxes, false), (select auth.uid())
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
      te_cotxes = coalesce(p_te_cotxes, false)
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
      'te_cotxes', coalesce(p_te_cotxes, false)
    )
  );

  return v_id;
end $$;

alter function public.admin_save_event(text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean, text, text, timestamptz, text, text, boolean, boolean) owner to postgres;
revoke all on function public.admin_save_event(text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean, text, text, timestamptz, text, text, boolean, boolean) from public, anon;
grant execute on function public.admin_save_event(text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean, text, text, timestamptz, text, text, boolean, boolean) to authenticated;

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

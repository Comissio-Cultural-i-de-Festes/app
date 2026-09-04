-- Desfà `20260904110000_56_una_sola_tanca_per_a_les_reunions.sql`.
--
-- NO ES POT EXECUTAR SOL. La migració 56 va tapar quatre portes per les quals
-- un soci corrent arribava a una reunió d'àmbit junta —la galeria, els cotxes,
-- l'interès i el contingut—. Desfer-la les torna a obrir totes quatre. Llegeix
-- la capçalera de la migració abans, que hi ha les respostes literals del
-- servidor que ho van demostrar.
--
-- Aquest directori no el mira la CLI: `supabase db reset` i `db push` només
-- apliquen el que hi ha a `supabase/migrations/`.

begin;

-- ── Porta 4: el contingut ───────────────────────────────────────────────────

drop policy econtent_select_member on public.event_content;

create policy econtent_select_member on public.event_content
  for select to authenticated
  using (
    (select private.is_active_member())
    and private.event_is_published(event_id)
    and visible_from is not null
    and visible_from <= now()
  );

-- ── Porta 3: l'interès ──────────────────────────────────────────────────────

create or replace function public.set_event_interest(p_event_id uuid, p_vol boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;
  if not private.event_is_published(p_event_id) then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  if p_vol then
    insert into public.event_interest (event_id, user_id)
    values (p_event_id, v_me)
    on conflict (event_id, user_id) do nothing;
  else
    delete from public.event_interest
     where event_id = p_event_id and user_id = v_me;
  end if;

  return jsonb_build_object(
    'vol', p_vol,
    'quants', (select count(*)::int from public.event_interest where event_id = p_event_id)
  );
end $fn$;

-- ── Porta 2: els cotxes ─────────────────────────────────────────────────────

create or replace function public.ride_candidates(p_ride_id uuid)
returns table (user_id uuid, nombre text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.id, p.nombre, p.avatar_url
  from public.profiles p
  where p.estat = 'actiu'
    and private.is_ride_driver(p_ride_id)
    and p.id <> (select auth.uid())
    and not exists (
      select 1
      from public.ride_seats s
      join public.rides r on r.id = s.ride_id
      join public.rides me on me.id = p_ride_id
      where s.user_id = p.id
        and r.event_id = me.event_id
        and r.sentit = me.sentit
    )
  order by p.nombre
$fn$;

create or replace function public.invite_to_ride(p_ride_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ride  public.rides%rowtype;
  v_taken int;
begin
  perform pg_advisory_xact_lock(hashtext('ride:' || p_ride_id::text));

  select * into v_ride from public.rides where id = p_ride_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if v_ride.driver_id <> (select auth.uid()) then
    raise exception 'nomes el conductor' using errcode = '42501';
  end if;

  if p_user_id = v_ride.driver_id then
    return jsonb_build_object('estat', 'ets_el_conductor');
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and estat = 'actiu'
  ) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if exists (
    select 1 from public.ride_seats s
    where s.ride_id = p_ride_id and s.user_id = p_user_id
  ) then
    return jsonb_build_object('estat', 'ja_hi_ets');
  end if;

  if exists (
    select 1
    from public.ride_seats s
    join public.rides r on r.id = s.ride_id
    where s.user_id = p_user_id
      and r.event_id = v_ride.event_id
      and r.sentit = v_ride.sentit
  ) then
    return jsonb_build_object('estat', 'altre_cotxe');
  end if;

  select count(*) into v_taken from public.ride_seats where ride_id = p_ride_id;
  if v_taken >= v_ride.places then
    return jsonb_build_object('estat', 'sense_places');
  end if;

  insert into public.ride_seats (ride_id, user_id, estat, convidat_per)
  values (p_ride_id, p_user_id, 'convidat', (select auth.uid()));

  return jsonb_build_object('estat', 'convidat', 'lliures', v_ride.places - v_taken - 1);
end $fn$;

create or replace function public.join_ride(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ride public.rides%rowtype;
  v_seat public.ride_seats%rowtype;
  v_taken int;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('ride:' || p_ride_id::text));

  select * into v_ride from public.rides where id = p_ride_id;
  if not found or not private.event_is_revealed(v_ride.event_id) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if v_ride.driver_id = (select auth.uid()) then
    return jsonb_build_object('estat', 'ets_el_conductor');
  end if;

  select * into v_seat
  from public.ride_seats
  where ride_id = p_ride_id and user_id = (select auth.uid());

  if found then
    if v_seat.estat = 'convidat' then
      update public.ride_seats set estat = 'a_dins'
       where ride_id = p_ride_id and user_id = (select auth.uid());
      return jsonb_build_object('estat', 'a_dins');
    end if;
    return jsonb_build_object('estat', 'ja_hi_ets');
  end if;

  if exists (
    select 1
    from public.ride_seats s
    join public.rides r on r.id = s.ride_id
    where s.user_id = (select auth.uid())
      and r.event_id = v_ride.event_id
      and r.sentit = v_ride.sentit
  ) then
    return jsonb_build_object('estat', 'altre_cotxe');
  end if;

  select count(*) into v_taken from public.ride_seats where ride_id = p_ride_id;
  if v_taken >= v_ride.places then
    return jsonb_build_object('estat', 'sense_places');
  end if;

  insert into public.ride_seats (ride_id, user_id) values (p_ride_id, (select auth.uid()));

  return jsonb_build_object('estat', 'a_dins', 'lliures', v_ride.places - v_taken - 1);
end $fn$;

-- ── Porta 1: la galeria ─────────────────────────────────────────────────────

drop policy "gallery photos are readable by members" on storage.objects;

create policy "gallery photos are readable by members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos'
    and (select private.is_active_member())
    and (select private.event_is_published(private.event_photo_event(name)))
  );

create or replace function public.event_photo_count(p_event_id uuid)
returns table (quantes int, persones int)
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::int, count(distinct f.user_id)::int
  from public.event_photos f
  where f.event_id = p_event_id
    and f.hidden_at is null
    and (select private.is_active_member())
    and (select private.event_is_published(p_event_id))
$fn$;

create or replace function public.event_photos(p_event_id uuid)
returns table (
  id          uuid,
  path        text,
  thumb_path  text,
  created_at  timestamptz,
  user_id     uuid,
  nom         text,
  meva        boolean,
  denunciada  boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    f.id,
    f.path,
    f.thumb_path,
    f.created_at,
    f.user_id,
    p.nombre,
    f.user_id = (select auth.uid()),
    exists (
      select 1 from public.photo_reports r
       where r.photo_id = f.id and r.user_id = (select auth.uid())
    )
  from public.event_photos f
  join public.profiles p on p.id = f.user_id
  where f.event_id = p_event_id
    and f.hidden_at is null
    and (select private.is_active_member())
    and (select private.event_is_published(p_event_id))
  order by f.created_at desc, f.id
$fn$;

drop policy photos_insert_own on public.event_photos;

create policy photos_insert_own on public.event_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.was_at_event(event_photos.event_id))
  );

drop policy photos_select on public.event_photos;

create policy photos_select on public.event_photos
  for select to authenticated
  using (
    (select private.is_active_member())
    and (select private.event_is_published(event_id))
    and (hidden_at is null or (select private.is_admin()))
  );

-- ── El helper ───────────────────────────────────────────────────────────────

create or replace function private.ride_is_visible(p_ride_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and private.event_is_revealed(r.event_id)
      and not private.event_is_junta_only(r.event_id)
  )
$fn$;

drop function if exists private.event_is_visible_to_caller(uuid);

commit;

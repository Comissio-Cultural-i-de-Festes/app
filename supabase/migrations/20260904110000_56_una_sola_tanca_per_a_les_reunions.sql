-- Una sola tanca per a l'àmbit de les reunions, i les quatre portes que hi
-- faltaven.
--
-- LA MIGRACIÓ 53 VA ANAR A CAÇAR EXACTAMENT AIXÒ i es va quedar a mig camí.
-- Va arreglar les polítiques i no va repassar ni les RPC ni la galeria. En
-- aquest projecte la diferència és tota la diferència: la doctrina és que una
-- taula sensible NO té grant d'INSERT, i per tant la RPC no és una capa més,
-- és TOTA l'autorització que hi ha. Allà on la política es va tapar i la RPC
-- no, no queda cap segona barrera.
--
-- LES QUATRE PORTES, provades una per una contra el servidor amb un token de
-- soci corrent i la reunió `e9` (abast = junta):
--
--   1. GALERIA. `event_photos(e9)` responia 200 amb la foto i el nom de qui
--      l'havia pujada; el bucket servia el fitxer i en signava una URL. Ni la
--      política `photos_select`, ni les dues RPC, ni la política de storage
--      miraven l'àmbit.
--   2. COTXES. `rides?event_id=eq.e9` responia 200 amb zero files —el soci no
--      el veu— i tot i així `join_ride` sobre aquell mateix cotxe responia 200
--      «a_dins», i la fila quedava escrita, visible al conductor de la junta,
--      que a més n'obté el telèfon per `ride_phones`.
--   3. INTERÈS. `set_event_interest(e9, true)` responia 200 i escrivia fila per
--      a un esdeveniment que el soci no pot veure per cap altre camí.
--   4. CONTINGUT. `event_content?event_id=eq.e9` responia 200 amb un bloc
--      titulat «acta secreta de la junta».
--
-- PER QUÈ UN HELPER I NO LA CONDICIÓ REPETIDA. La condició `not
-- private.event_is_junta_only(x) or private.is_admin()` ja vivia escrita a mà a
-- `att_insert_self`, `att_update_self`, `rides_select_member`,
-- `rides_insert_driver` i `private.ride_is_visible`. Afegir-la a nou llocs més
-- vol dir catorze còpies de la mateixa frase, i el dia que la regla canviï
-- —posem, que el president emèrit també hi arribi— n'hi haurà tres que es
-- quedaran enrere. Ja ha passat dues vegades seguides: la 50 va posar la tanca
-- massa ampla, la 54 la va haver d'obrir, i la 53 la va posar en uns objectes i
-- no en uns altres.
--
-- Així que la frase passa a viure en un sol lloc,
-- `private.event_is_visible_to_caller()`, i `private.ride_is_visible` es
-- reescriu per damunt seu. Aquesta migració deixa CATORZE còpies en UNA.
--
-- QUÈ NO FA EL HELPER, i per què hi ha dos llocs que segueixen amb condició
-- pròpia. El helper mira QUI CRIDA, perquè `is_admin()` llegeix `auth.uid()`.
-- A `invite_to_ride` i a `ride_candidates` la pregunta és una altra: no si el
-- conductor pot veure el cotxe —pot, és de la junta— sinó si la persona A LA
-- QUAL convida hi pot arribar. Això no és una tanca de visibilitat del
-- llamant i barrejar-ho al helper el faria mentir, així que allà va explícit.

-- ── El helper ───────────────────────────────────────────────────────────────

create or replace function private.event_is_visible_to_caller(p_event_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = ''
as $fn$
  -- Una reunió d'àmbit junta només existeix per a la junta. Tota la resta
  -- d'esdeveniments els veu qualsevol soci. I aquesta funció NO diu res sobre
  -- si està publicat ni revelat: això ho decideix cada lloc, que en sap més.
  select not private.event_is_junta_only(p_event_id)
      or (select private.is_admin())
$fn$;

alter function private.event_is_visible_to_caller(uuid) owner to postgres;
revoke all on function private.event_is_visible_to_caller(uuid) from public, anon;
-- `authenticated` SÍ, i no és un descuit: aquesta funció es fa servir dins de
-- polítiques, i el predicat d'una política corre COM EL LLAMANT. Sense aquest
-- grant, `photos_select` i `econtent_select_member` fallen per a tothom i la
-- galeria d'una festa normal deixa de veure's. `anon` no: no ha d'arribar a
-- cap esdeveniment.
grant execute on function private.event_is_visible_to_caller(uuid) to authenticated;

comment on function private.event_is_visible_to_caller(uuid) is
  'L''àmbit d''un esdeveniment deixa que qui crida hi arribi. NOMES l''àmbit: '
  'publicat i revelat els decideix cada lloc. Viu al schema private perquè '
  'PostgREST no l''exposa i perquè el seu predicat ha de córrer per damunt de '
  'la RLS d''events, no per sota.';

-- `ride_is_visible` deia la mateixa frase amb altres paraules. Ara la delega,
-- i de passada guanya el «o ets de la junta» que li faltava: fins ara amagava
-- els cotxes d'una reunió de junta també als de la junta, que hi arribaven
-- només per `rides_select_admin`. Una asimetria que no calia.
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
      and private.event_is_visible_to_caller(r.event_id)
  )
$fn$;

-- ── Porta 1: la galeria ─────────────────────────────────────────────────────

drop policy photos_select on public.event_photos;

create policy photos_select on public.event_photos
  for select to authenticated
  using (
    (select private.is_active_member())
    and (select private.event_is_published(event_id))
    and private.event_is_visible_to_caller(event_id)
    and (hidden_at is null or (select private.is_admin()))
  );

-- També la d'escriure. Qui no pot llegir la galeria d'una reunió tampoc no hi
-- ha de poder pujar: `was_at_event` deixaria pujar-hi qui la junta hagués
-- apuntat com a present, i acabaria amb una foto que no pot tornar a veure.
drop policy photos_insert_own on public.event_photos;

create policy photos_insert_own on public.event_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.was_at_event(event_id))
    and private.event_is_visible_to_caller(event_id)
  );

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
    and private.event_is_visible_to_caller(p_event_id)
  order by f.created_at desc, f.id
$fn$;

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
    and private.event_is_visible_to_caller(p_event_id)
$fn$;

-- La de storage. Aquesta és la que pgTAP no pot provar —`storage.protect_delete()`
-- bloqueja el DELETE directe— i per això és la que més fàcil és oblidar: el
-- fitxer es servia igual que abans encara que la fila ja no es veiés.
drop policy "gallery photos are readable by members" on storage.objects;

create policy "gallery photos are readable by members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos'
    and (select private.is_active_member())
    and (select private.event_is_published(private.event_photo_event(name)))
    and private.event_is_visible_to_caller(private.event_photo_event(name))
  );

-- ── Porta 2: els cotxes ─────────────────────────────────────────────────────

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
  -- `ride_is_visible` i no `event_is_revealed`: porta les dues meitats i és la
  -- mateixa funció que fa servir la política de SELECT de `rides`, o sigui que
  -- el que es pot ocupar i el que es pot veure ja no poden divergir.
  if not found or not private.ride_is_visible(p_ride_id) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if v_ride.driver_id = (select auth.uid()) then
    return jsonb_build_object('estat', 'ets_el_conductor');
  end if;

  select * into v_seat
  from public.ride_seats
  where ride_id = p_ride_id and user_id = (select auth.uid());

  if found then
    -- A seat being held for you: taking it is accepting it, not a second seat.
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

-- Qui es pot convidar a un cotxe d'una reunió de junta. Aquí la pregunta no és
-- sobre qui crida —el conductor és de la junta— sinó sobre la persona
-- convidada, i per això la condició va explícita i no pel helper.
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

  -- Only the driver of this car, and only a car that still exists. An admin is
  -- not allowed either: whose car it is is the driver's business.
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

  -- A una reunió de junta només s'hi pot guardar seient a algú de la junta.
  -- Guardar-l'hi a un soci de fora li diria que la reunió existeix, que és
  -- justament el que l'àmbit tapa a tota la resta de l'app.
  if private.event_is_junta_only(v_ride.event_id)
     and not exists (
       select 1 from public.profiles
        where id = p_user_id and role in ('admin', 'owner')
     ) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if exists (
    select 1 from public.ride_seats s
    where s.ride_id = p_ride_id and s.user_id = p_user_id
  ) then
    return jsonb_build_object('estat', 'ja_hi_ets');
  end if;

  -- Somebody already travelling that way is not free to be held a second seat.
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

-- I la llista que alimenta aquell botó, amb el mateix criteri: a una reunió de
-- junta no s'ofereix ningú de fora.
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
    and (
      not exists (
        select 1 from public.rides r
         where r.id = p_ride_id and private.event_is_junta_only(r.event_id)
      )
      or p.role in ('admin', 'owner')
    )
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
  -- Mateix codi que abans per a l'esdeveniment que no hi és i per al que no es
  -- pot veure: des de fora han de ser indistingibles, o l'error és un oracle
  -- que diu quines reunions de junta existeixen.
  if not private.event_is_published(p_event_id)
     or not private.event_is_visible_to_caller(p_event_id) then
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

-- ── Porta 4: el contingut ───────────────────────────────────────────────────

drop policy econtent_select_member on public.event_content;

create policy econtent_select_member on public.event_content
  for select to authenticated
  using (
    (select private.is_active_member())
    and private.event_is_published(event_id)
    and private.event_is_visible_to_caller(event_id)
    and visible_from is not null
    and visible_from <= now()
  );

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- El SQL per desfer-ho tot és a
-- `supabase/rollbacks/56_una_sola_tanca_per_a_les_reunions.sql`.
--
-- Va en un directori a part i NO dins de `supabase/migrations/`: la CLI aplica
-- tot el que hi troba, i una migració que es desfa a si mateixa tot seguit és
-- pitjor que no aplicar-la. Aquell directori no el mira ningú automàticament.

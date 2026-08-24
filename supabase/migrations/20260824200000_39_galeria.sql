-- La galeria de cada activitat.
--
-- ON VIUEN LES FOTOS, i per què. L'especificació original parlava d'un servidor
-- propi amb MinIO en un portàtil. S'ha descartat: una màquina que depèn que hi
-- sigui una persona concreta no és infraestructura, i la comi canvia de junta
-- cada any. Van a Supabase, amb el pressupost de zero euros que això implica.
--
-- I d'aquí surt tota la resta del disseny. El sostre no és el que ocupen sinó
-- el que es baixa: dues-centes fotos recorregudes a mida completa són trenta-sis
-- megues cada vegada que algú passa la graella. Per això cada foto es desa dues
-- vegades —la bona i una miniatura— i la graella només demana miniatures. La
-- miniatura la fa el navegador de qui la puja, abans d'enviar-la: cap màquina
-- de ningú pel mig.
--
-- QUI POT FER QUÈ, dit d'una vegada:
--
--   Puja qui hi va fitxar. No qui va dir que hi aniria: qui hi era. És l'única
--   manera que la galeria d'una nit sigui d'aquella nit.
--
--   Mira qualsevol soci que pugui veure l'activitat. Les fotos d'una festa són
--   de la festa, no de qui hi va anar.
--
--   Esborra qui l'ha pujada, i la junta. Despenjar-la l'amaga de tothom a
--   l'instant sense esborrar el fitxer, perquè una decisió presa a les tres de
--   la matinada s'ha de poder desfer.
--
-- RES A VEURE AMB LES FOTOS DE PORTA. `door-photos` guarda la cara d'algú
-- entrant i sortint, és privada i seguirà sent-ho. Aquesta és la festa.

-- ── el bucket ───────────────────────────────────────────────────────────────
-- Privat, com els altres dos, i pel mateix motiu: un bucket «públic» de
-- Supabase és públic per a tot internet, l'enllaç no caduca mai i segueix
-- funcionant quan qui surt a la foto ja fa anys que ha marxat de la comi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-photos', 'event-photos', false, 5242880,
   array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ── llegir un camí ──────────────────────────────────────────────────────────
-- `{esdeveniment}/{uid}/{quan}.jpg`, amb qui la puja com a carpeta i no com a
-- part del nom, perquè la política pugui decidir sense consultar cap taula. La
-- miniatura és el mateix camí amb `.thumb` abans de l'extensió, o sigui que
-- comparteix carpeta i comparteix permís: no hi ha manera de pujar una
-- miniatura on no es pot pujar la seva foto.
--
-- `language sql` amb un guardià de regex i no plpgsql amb captura d'excepcions:
-- això corre un cop per fila dins d'una política, i un gestor d'excepcions
-- costa una subtransacció cada vegada. Un `case` sense `else` dóna el null que
-- es mereix un camí mal format, i una política que rep null refusa.
create or replace function private.event_photo_owner(p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when array_length(storage.foldername(p_name), 1) = 2
     and (storage.foldername(p_name))[2] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(p_name))[2])::uuid
  end
$$;

create or replace function private.event_photo_event(p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when array_length(storage.foldername(p_name), 1) = 2
     and (storage.foldername(p_name))[1] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
  end
$$;

alter function private.event_photo_owner(text) owner to postgres;
alter function private.event_photo_event(text) owner to postgres;
revoke all on function private.event_photo_owner(text) from public, anon;
revoke all on function private.event_photo_event(text) from public, anon;
grant execute on function private.event_photo_owner(text) to authenticated;
grant execute on function private.event_photo_event(text) to authenticated;

comment on function private.event_photo_owner(text) is
  'Qui va pujar una foto de galeria, llegit del seu camí, o null si el camí no '
  'és {esdeveniment}/{uid}/…. No llança mai: corre dins de polítiques de '
  'storage, on una excepció és un 500 i no una negativa.';

-- ── hi vas ser ──────────────────────────────────────────────────────────────
-- Fitxat, no apuntat. Dir que hi aniries i no venir-hi no dóna dret a omplir la
-- galeria d'aquella nit.
create or replace function private.was_at_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.attendances
     where event_id = p_event_id
       and user_id = (select auth.uid())
       and estado = 'asistio'
  )
$$;

alter function private.was_at_event(uuid) owner to postgres;
revoke all on function private.was_at_event(uuid) from public, anon;
grant execute on function private.was_at_event(uuid) to authenticated;

-- ── les fotos ───────────────────────────────────────────────────────────────
create table if not exists public.event_photos (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  path       text not null unique,
  thumb_path text not null,
  created_at timestamptz not null default now(),
  -- Despenjada. No esborrada: la junta ha de poder desfer una decisió presa a
  -- les tres de la matinada, i qui la va pujar només ha de veure que ja no hi
  -- és.
  hidden_at  timestamptz,
  hidden_by  uuid references public.profiles (id) on delete set null
);

comment on table public.event_photos is
  'Les fotos d''una activitat. Dos camins per fila: la bona i la miniatura. La '
  'graella només demana miniatures — el sostre d''aquesta funció no és el que '
  'ocupen sinó el que es baixa.';

create index event_photos_event_idx
  on public.event_photos (event_id, created_at desc) where hidden_at is null;
create index event_photos_user_idx on public.event_photos (user_id);

alter table public.event_photos enable row level security;

-- Es veuen les que es poden veure de l'activitat, i les despenjades no les veu
-- ningú tret de la junta, que ha de poder tornar-les a penjar.
create policy photos_select on public.event_photos
  for select to authenticated
  using (
    (select private.is_active_member())
    and (select private.event_is_published(event_id))
    and (hidden_at is null or (select private.is_admin()))
  );

create policy photos_insert_own on public.event_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.was_at_event(event_id))
  );

create policy photos_delete_own on public.event_photos
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Només la junta despenja, i l'única columna que es pot moure és aquesta.
create policy photos_update_admin on public.event_photos
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.event_photos from anon, authenticated;
grant select, insert, delete on public.event_photos to authenticated;
grant update (hidden_at, hidden_by) on public.event_photos to authenticated;
grant select, insert, update, delete on public.event_photos to service_role;

-- ── les denúncies ───────────────────────────────────────────────────────────
-- «Hi surto i no vull sortir-hi» és el motiu que justifica tota aquesta taula.
-- Surt gent a les fotos que no ha demanat sortir-hi, i han de poder dir-ho
-- sense que qui la va pujar sàpiga qui ho ha demanat.
create table if not exists public.photo_reports (
  id         uuid primary key default gen_random_uuid(),
  photo_id   uuid not null references public.event_photos (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  motiu      text not null check (motiu in ('hi_surto', 'no_es_d_aquella_nit', 'altra')),
  created_at timestamptz not null default now(),
  resolt_at  timestamptz,
  resolt_per uuid references public.profiles (id) on delete set null,
  -- Una persona, una denúncia per foto. Sense això, tocar dues vegades el botó
  -- posaria la mateixa foto dues vegades a la cua de la junta.
  unique (photo_id, user_id)
);

comment on table public.photo_reports is
  'Anònimes per a tothom qui no sigui la junta: qui va pujar la foto no pot '
  'llegir aquesta taula ni sabrà mai qui ho va demanar. La junta sí, perquè '
  'algú ha de poder parlar amb la persona si cal.';

create index photo_reports_open_idx
  on public.photo_reports (created_at) where resolt_at is null;

alter table public.photo_reports enable row level security;

-- Es veuen les pròpies —perquè la pantalla pugui dir «ja ho has demanat»— i la
-- junta les veu totes. Qui va pujar la foto no hi té cap accés.
create policy reports_select on public.photo_reports
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy reports_insert_own on public.photo_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member()));

create policy reports_update_admin on public.photo_reports
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.photo_reports from anon, authenticated;
grant select, insert on public.photo_reports to authenticated;
grant update (resolt_at, resolt_per) on public.photo_reports to authenticated;
grant select, insert, update, delete on public.photo_reports to service_role;

-- ── el bucket, les polítiques ───────────────────────────────────────────────
create policy "gallery photos are readable by members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-photos'
    and (select private.is_active_member())
    and (select private.event_is_published(private.event_photo_event(name)))
  );

-- Puja qui hi va fitxar, i només a la seva pròpia carpeta d'aquella activitat.
-- Les dues condicions són el camí: sense la segona, qualsevol dels que hi eren
-- podria escriure a la carpeta d'un altre i la propietat deixaria de voler dir
-- res a l'hora d'esborrar.
create policy "gallery photos are written by whoever was there"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and private.event_photo_owner(name) = (select auth.uid())
    and (select private.was_at_event(private.event_photo_event(name)))
  );

-- Cap política d'UPDATE, com a `door-photos`: una foto no es substitueix en
-- silenci. Se'n puja una altra i s'esborra la primera.
create policy "gallery photos are removed by whoever put them there"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-photos'
    and (
      (select private.is_admin())
      or private.event_photo_owner(name) = (select auth.uid())
    )
  );

-- ── llegir-ne una activitat ─────────────────────────────────────────────────
-- Definer per un motiu petit i concret: la graella ha de dir qui la va pujar,
-- i `profiles` és llegible però ajuntar-hi la taula des del client seria una
-- incrustació de PostgREST més per revisar. Una funció, una resposta, i el
-- filtre de despenjades escrit un sol cop.
create or replace function public.event_photos(p_event_id uuid)
returns table (
  id         uuid,
  path       text,
  thumb_path text,
  created_at timestamptz,
  user_id    uuid,
  nom        text,
  meva       boolean,
  denunciada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

alter function public.event_photos(uuid) owner to postgres;
revoke all on function public.event_photos(uuid) from public, anon;
grant execute on function public.event_photos(uuid) to authenticated, service_role;

comment on function public.event_photos(uuid) is
  'Les fotos visibles d''una activitat, amb qui les va pujar i si tu ja l''has '
  'denunciada. Les despenjades no hi surten per a ningú, ni per a la junta: '
  'per a repenjar-les hi ha admin_reported_photos().';

-- ── quantes n'hi ha ─────────────────────────────────────────────────────────
-- El bloc del detall diu «42 de 18 persones» i ensenya tres miniatures. Amb
-- això no cal demanar les quaranta-dues files per pintar-lo.
create or replace function public.event_photo_count(p_event_id uuid)
returns table (quantes int, persones int)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int, count(distinct f.user_id)::int
  from public.event_photos f
  where f.event_id = p_event_id
    and f.hidden_at is null
    and (select private.is_active_member())
    and (select private.event_is_published(p_event_id))
$$;

alter function public.event_photo_count(uuid) owner to postgres;
revoke all on function public.event_photo_count(uuid) from public, anon;
grant execute on function public.event_photo_count(uuid) to authenticated, service_role;

-- ── denunciar-ne una ────────────────────────────────────────────────────────
-- Idempotent: tocar-hi dues vegades no posa la foto dues vegades a la cua ni
-- treu cap error a qui ja ho havia demanat i no se'n recorda.
create or replace function public.report_photo(p_photo_id uuid, p_motiu text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  if p_motiu not in ('hi_surto', 'no_es_d_aquella_nit', 'altra') then
    raise exception 'motiu desconegut' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.event_photos f
     where f.id = p_photo_id and f.hidden_at is null
  ) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  insert into public.photo_reports (photo_id, user_id, motiu)
  values (p_photo_id, v_me, p_motiu)
  on conflict (photo_id, user_id) do nothing;

  return jsonb_build_object('estat', 'rebuda');
end;
$$;

alter function public.report_photo(uuid, text) owner to postgres;
revoke all on function public.report_photo(uuid, text) from public, anon;
grant execute on function public.report_photo(uuid, text) to authenticated, service_role;

comment on function public.report_photo(uuid, text) is
  'Demana que la junta miri una foto. Qui la va pujar no ho sabrà mai: '
  'photo_reports no és llegible per a ell.';

-- ── la cua de la junta ──────────────────────────────────────────────────────
create or replace function public.admin_reported_photos()
returns table (
  photo_id   uuid,
  thumb_path text,
  path       text,
  event_id   uuid,
  titol      text,
  pujada_per text,
  motiu      text,
  quantes    int,
  despenjada boolean
)
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
    e.titulo,
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
  join public.profiles p on p.id = f.user_id
  where r.resolt_at is null
    and (select private.is_admin())
  group by f.id, f.thumb_path, f.path, f.event_id, e.titulo, p.nombre, f.hidden_at
  order by min(r.created_at)
$$;

alter function public.admin_reported_photos() owner to postgres;
revoke all on function public.admin_reported_photos() from public, anon;
grant execute on function public.admin_reported_photos() to authenticated, service_role;

comment on function public.admin_reported_photos() is
  'Les denunciades que ningú ha mirat encara. El motiu que surt és el més greu '
  'dels que s''han donat, perquè és el que decideix què cal fer. Qui va '
  'denunciar no hi surt: la junta no ho necessita per despenjar-la.';

-- ── despenjar-la o deixar-la ────────────────────────────────────────────────
create or replace function public.admin_decide_photo(p_photo_id uuid, p_despenja boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_despenja then
    update public.event_photos
       set hidden_at = now(), hidden_by = v_me
     where id = p_photo_id;
  else
    -- Deixar-la també vol dir tornar-la a penjar si ja s'havia despenjat: és el
    -- mateix botó vist des de l'altre costat, i és el que fa que despenjar no
    -- sigui una decisió definitiva.
    update public.event_photos
       set hidden_at = null, hidden_by = null
     where id = p_photo_id;
  end if;

  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- La cua es buida sempre, tant si es despenja com si es deixa: la feina de
  -- la junta és mirar-la, i mirar-la ja s'ha fet.
  update public.photo_reports
     set resolt_at = now(), resolt_per = v_me
   where photo_id = p_photo_id and resolt_at is null;

  return jsonb_build_object('estat', case when p_despenja then 'despenjada' else 'penjada' end);
end;
$$;

alter function public.admin_decide_photo(uuid, boolean) owner to postgres;
revoke all on function public.admin_decide_photo(uuid, boolean) from public, anon;
grant execute on function public.admin_decide_photo(uuid, boolean) to authenticated, service_role;

comment on function public.admin_decide_photo(uuid, boolean) is
  'Despenja una foto o la torna a penjar, i buida la seva cua en tots dos '
  'casos. Mai esborra el fitxer: despenjar ha de ser reversible.';

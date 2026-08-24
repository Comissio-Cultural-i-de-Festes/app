-- La gimcana.
--
-- Penja d'una activitat, té proves, i les proves es completen enviant una foto
-- que la junta valida abans de puntuar. Aquesta última part és una decisió, i
-- té un cost dit en veu alta: el marcador va un pas per darrere de la realitat.
-- Es compensa fent que validar siguin dos tocs i dient a tothom quantes fotos
-- hi ha a la cua, no fent com si el cost no hi fos.
--
-- L'EQUIP NO ÉS L'ESCOLA. Aquesta és la part que el disseny no podia saber: les
-- gimcanes es fan sovint amb grups fets per a la nit —a l'atzar, repartits per
-- la junta, o triats per la gent— i les tres escoles són només una de les
-- quatre maneres. Un equip, per tant, és una cosa pròpia de la gimcana, i el
-- marcador i el «un cop per equip» van tots per equip.
--
-- «De quin equip sóc» té una sola resposta i dues maneres d'arribar-hi:
-- `private.gimcana_team()`. En mode escoles surt del perfil; en els altres
-- tres, d'una taula de membres. Dues maneres de respondre una pregunta, no dos
-- conceptes d'equip.
--
-- UNA PROVA PUNTUA UN COP PER EQUIP. Totes les escoles o equips poden fer totes
-- les proves, i dins d'un equip només la primera foto validada d'una prova
-- suma: cinc persones enviant la mateixa prova no multipliquen els punts. Ho
-- diu un índex únic parcial i no el codi, com el de l'assistència.
--
-- EL MARCADOR ÉS DE LA NIT. No toca el rànquing del curs ni escriu a
-- `points_log`. Si algun dia ha de comptar, això és una decisió de barem i no
-- una pantalla nova.

-- ── el bucket ───────────────────────────────────────────────────────────────
-- Propi, i no dins de `door-photos`: allà `private.door_photo_owner()`
-- interpreta el camí, i barrejar-hi una tercera mena de foto trencaria la
-- lectura. Les fotos d'enviament no són la galeria: només les veu la junta i
-- qui les envia.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('gimcana-photos', 'gimcana-photos', false, 3145728, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ── la gimcana ──────────────────────────────────────────────────────────────
create table if not exists public.gimcanes (
  id           uuid primary key default gen_random_uuid(),
  -- Una per activitat. Dues gimcanes la mateixa nit serien dos marcadors i cap
  -- manera d'explicar quin guanya.
  event_id     uuid not null unique references public.events (id) on delete cascade,
  mena_equips  text not null default 'escoles'
                 check (mena_equips in ('escoles', 'junta', 'sorteig', 'lliure')),
  -- Només serveix en mode lliure: quanta gent cap en un equip. Null vol dir
  -- que no hi ha topall.
  topall_equip int check (topall_equip is null or topall_equip > 0),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on column public.gimcanes.mena_equips is
  'Com es reparteix la gent. `escoles` no necessita configurar res i no deixa '
  'ningú sense equip; les altres tres omplen gimcana_membres.';

-- ── els equips ──────────────────────────────────────────────────────────────
create table if not exists public.gimcana_equips (
  id         uuid primary key default gen_random_uuid(),
  gimcana_id uuid not null references public.gimcanes (id) on delete cascade,
  -- Un dels dos, mai els dos. En mode escoles el nom surt de les traduccions
  -- que ja hi són, no de la base: el nom d'una escola no es desa tres vegades.
  nom        text check (nom is null or length(nom) between 1 and 40),
  escola     text check (escola in ('politecnica', 'empresa', 'salut')),
  ordre      int not null default 0,
  unique (gimcana_id, escola)
);

create index gimcana_equips_gimcana_idx on public.gimcana_equips (gimcana_id, ordre);

-- ── qui és de quin ──────────────────────────────────────────────────────────
create table if not exists public.gimcana_membres (
  gimcana_id uuid not null references public.gimcanes (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  equip_id   uuid not null references public.gimcana_equips (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (gimcana_id, user_id)
);

comment on table public.gimcana_membres is
  'Només l''omplen els tres modes explícits. En mode escoles està buida i qui '
  'és de quin equip surt del perfil, que és el que fa que ningú es quedi fora.';

create index gimcana_membres_equip_idx on public.gimcana_membres (equip_id);

-- ── les proves ──────────────────────────────────────────────────────────────
create table if not exists public.gimcana_proves (
  id          uuid primary key default gen_random_uuid(),
  gimcana_id  uuid not null references public.gimcanes (id) on delete cascade,
  titol       text not null check (length(titol) between 3 and 120),
  descripcio  text,
  punts       int not null default 10 check (punts between 0 and 100),
  ordre       int not null default 0,
  created_at  timestamptz not null default now()
);

create index gimcana_proves_gimcana_idx on public.gimcana_proves (gimcana_id, ordre);

-- ── els enviaments ──────────────────────────────────────────────────────────
create table if not exists public.gimcana_enviaments (
  id                uuid primary key default gen_random_uuid(),
  prova_id          uuid not null references public.gimcana_proves (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  equip_id          uuid not null references public.gimcana_equips (id) on delete cascade,
  path              text not null,
  estat             text not null default 'pendent'
                      check (estat in ('pendent', 'validada', 'rebutjada')),
  -- El perquè d'un «no val». Sempre n'hi ha un: la pantalla de qui l'ha
  -- enviada el llegeix, i sense ell la negativa no deixa cap porta oberta.
  motiu             text,
  validat_per       uuid references public.profiles (id) on delete set null,
  validat_a         timestamptz,
  -- Generat un cop al mòbil, quan es prem el botó, i mai regenerat: la cua de
  -- fora de línia es pot reenviar sense duplicar res. Mateix contracte que els
  -- fitxatges.
  client_request_id uuid,
  created_at        timestamptz not null default now()
);

-- La regla del joc, dita per la base i no pel codi. Cinc persones del mateix
-- equip enviant la mateixa prova no multipliquen els punts, i una altra escola
-- pot fer-la igualment.
create unique index gimcana_una_per_equip
  on public.gimcana_enviaments (prova_id, equip_id)
  where estat = 'validada';

create unique index gimcana_client_request_id_key
  on public.gimcana_enviaments (client_request_id)
  where client_request_id is not null;

create index gimcana_enviaments_cua_idx
  on public.gimcana_enviaments (created_at) where estat = 'pendent';
create index gimcana_enviaments_prova_idx on public.gimcana_enviaments (prova_id);
create index gimcana_enviaments_user_idx on public.gimcana_enviaments (user_id);

-- ── quan es veu ─────────────────────────────────────────────────────────────
-- Es destapa quan comença la festa i es tanca quan acaba, reaprofitant la
-- finestra de la migració 36. Cap interruptor que algú s'hagi de recordar
-- d'obrir la nit que hi ha dues-centes persones esperant.
create or replace function private.gimcana_is_open(p_gimcana_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (now() at time zone 'UTC') <@ private.checkin_open_at(g.event_id),
    false)
  from public.gimcanes g
  where g.id = p_gimcana_id
$$;

alter function private.gimcana_is_open(uuid) owner to postgres;
revoke all on function private.gimcana_is_open(uuid) from public, anon;
grant execute on function private.gimcana_is_open(uuid) to authenticated;

-- ── de quin equip sóc ───────────────────────────────────────────────────────
-- L'única resposta a la pregunta, amb dues maneres d'arribar-hi. El coalesce
-- no és decoració: en mode escoles, algú que encara no ha dit de quina escola
-- és no té equip pel camí de dalt, i la junta l'hi ha de poder posar a mà.
create or replace function private.gimcana_team(p_gimcana_id uuid, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case (select g.mena_equips from public.gimcanes g where g.id = p_gimcana_id)
      when 'escoles' then (
        select e.id
        from public.gimcana_equips e
        join public.profiles p on p.id = p_user
        where e.gimcana_id = p_gimcana_id
          and e.escola is not null
          and e.escola = p.escola
      )
    end,
    (select m.equip_id from public.gimcana_membres m
      where m.gimcana_id = p_gimcana_id and m.user_id = p_user)
  )
$$;

alter function private.gimcana_team(uuid, uuid) owner to postgres;
revoke all on function private.gimcana_team(uuid, uuid) from public, anon;
grant execute on function private.gimcana_team(uuid, uuid) to authenticated;

comment on function private.gimcana_team(uuid, uuid) is
  'De quin equip és algú en una gimcana. En mode escoles surt del perfil; en '
  'els altres tres, de gimcana_membres. Una pregunta, dues maneres de '
  'respondre-la, i no dos conceptes d''equip.';

-- ── i si no en tinc cap ─────────────────────────────────────────────────────
-- Qui arriba quan els equips ja estan fets va al més petit. Es fa quan obre la
-- gimcana i no en fitxar: acoblar-ho a `check_in_here` seria fer que fitxar a
-- la porta depengui d'un joc que potser no existeix.
create or replace function private.gimcana_join_smallest(p_gimcana_id uuid, p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_team uuid := private.gimcana_team(p_gimcana_id, p_user);
begin
  if v_team is not null then
    return v_team;
  end if;

  select e.id into v_team
  from public.gimcana_equips e
  left join public.gimcana_membres m on m.equip_id = e.id
  where e.gimcana_id = p_gimcana_id
  group by e.id, e.ordre
  order by count(m.user_id), e.ordre, e.id
  limit 1;

  if v_team is null then
    return null;
  end if;

  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  values (p_gimcana_id, p_user, v_team)
  on conflict (gimcana_id, user_id) do nothing;

  return private.gimcana_team(p_gimcana_id, p_user);
end;
$$;

alter function private.gimcana_join_smallest(uuid, uuid) owner to postgres;
revoke all on function private.gimcana_join_smallest(uuid, uuid) from public, anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.gimcanes enable row level security;
alter table public.gimcana_equips enable row level security;
alter table public.gimcana_membres enable row level security;
alter table public.gimcana_proves enable row level security;
alter table public.gimcana_enviaments enable row level security;

-- Tot el que es llegeix de la gimcana passa per funcions definer, que és on
-- viu la finestra de temps. Aquestes polítiques són la xarxa de sota: la junta
-- ho veu tot perquè ho ha de poder preparar abans, i un soci veu la seva part.
create policy gimcanes_admin on public.gimcanes
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy gimcanes_select_member on public.gimcanes
  for select to authenticated
  using ((select private.is_active_member()));

create policy equips_admin on public.gimcana_equips
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy equips_select_member on public.gimcana_equips
  for select to authenticated
  using ((select private.is_active_member()));

create policy membres_admin on public.gimcana_membres
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy membres_select_member on public.gimcana_membres
  for select to authenticated
  using ((select private.is_active_member()));

create policy proves_admin on public.gimcana_proves
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy proves_select_member on public.gimcana_proves
  for select to authenticated
  using ((select private.is_active_member()));

-- Els enviaments: el teu i els del teu equip. La foto d'una prova la mira la
-- junta, i qui l'ha enviada ha de poder veure què li han dit.
create policy enviaments_select on public.gimcana_enviaments
  for select to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())
    or equip_id = (select private.gimcana_team(
         (select p.gimcana_id from public.gimcana_proves p where p.id = prova_id),
         (select auth.uid())))
  );

create policy enviaments_admin on public.gimcana_enviaments
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Cap grant d'INSERT per a `authenticated`: enviar una prova passa sempre per
-- submit_prova(), que és qui comprova la finestra, l'equip i el camí de la
-- foto. Una fila escrita a mà no tindria res d'això.
revoke all on public.gimcanes from anon, authenticated;
revoke all on public.gimcana_equips from anon, authenticated;
revoke all on public.gimcana_membres from anon, authenticated;
revoke all on public.gimcana_proves from anon, authenticated;
revoke all on public.gimcana_enviaments from anon, authenticated;

grant select on public.gimcanes to authenticated;
grant select on public.gimcana_equips to authenticated;
grant select on public.gimcana_membres to authenticated;
grant select on public.gimcana_proves to authenticated;
grant select on public.gimcana_enviaments to authenticated;

grant select, insert, update, delete on public.gimcanes to service_role;
grant select, insert, update, delete on public.gimcana_equips to service_role;
grant select, insert, update, delete on public.gimcana_membres to service_role;
grant select, insert, update, delete on public.gimcana_proves to service_role;
grant select, insert, update, delete on public.gimcana_enviaments to service_role;

-- ── el bucket, les polítiques ───────────────────────────────────────────────
-- `{gimcana}/{uid}/{quan}.jpg`. La junta les veu totes i cadascú la seva, que
-- és el que fa que qui l'ha enviada pugui veure la foto que li han rebutjat.
create policy "gimcana photos are the junta's and yours"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'gimcana-photos'
    and (
      (select private.is_admin())
      or (storage.foldername(name))[2] = (select auth.uid())::text
    )
  );

create policy "gimcana photos are written by whoever plays"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gimcana-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (select private.is_active_member())
  );

create policy "gimcana photos are removed by the junta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gimcana-photos' and (select private.is_admin()));

-- ── el que veu qui juga ─────────────────────────────────────────────────────
create or replace function public.gimcana_for_event(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_gimcana public.gimcanes%rowtype;
  v_team    uuid;
  v_proves  jsonb;
  v_equip   jsonb;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select * into v_gimcana from public.gimcanes where event_id = p_event_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- Fins que comença la festa no la veu ningú, i quan acaba es tanca. La junta
  -- sí, perquè l'ha de poder preparar i repassar després.
  if not private.gimcana_is_open(v_gimcana.id) and not private.is_admin() then
    return jsonb_build_object('estat', 'tancada');
  end if;

  -- Triar equip és de qui juga en mode lliure; a la resta se li posa el més
  -- petit si encara no en té cap.
  if v_gimcana.mena_equips = 'lliure' then
    v_team := private.gimcana_team(v_gimcana.id, v_me);
  else
    v_team := private.gimcana_join_smallest(v_gimcana.id, v_me);
  end if;

  select jsonb_build_object('id', e.id, 'nom', e.nom, 'escola', e.escola)
    into v_equip
  from public.gimcana_equips e where e.id = v_team;

  select coalesce(jsonb_agg(x order by x.ordre, x.id), '[]'::jsonb) into v_proves
  from (
    select
      p.id,
      p.ordre,
      p.titol,
      p.descripcio,
      p.punts,
      -- L'estat de la prova per al TEU equip, no per a tu: si un company ja la
      -- va validar, no cal que la tornis a fer.
      (select s.estat from public.gimcana_enviaments s
        where s.prova_id = p.id and s.equip_id = v_team
        order by case s.estat when 'validada' then 1 when 'pendent' then 2 else 3 end,
                 s.created_at desc
        limit 1) as estat,
      (select s.motiu from public.gimcana_enviaments s
        where s.prova_id = p.id and s.equip_id = v_team and s.estat = 'rebutjada'
        order by s.created_at desc limit 1) as motiu,
      (select pr.nombre from public.gimcana_enviaments s
        join public.profiles pr on pr.id = s.user_id
        where s.prova_id = p.id and s.equip_id = v_team and s.estat = 'validada'
        limit 1) as qui
    from public.gimcana_proves p
    where p.gimcana_id = v_gimcana.id
  ) x;

  return jsonb_build_object(
    'estat', 'oberta',
    'id', v_gimcana.id,
    'mena_equips', v_gimcana.mena_equips,
    'topall_equip', v_gimcana.topall_equip,
    'equip', v_equip,
    'proves', v_proves,
    'a_la_cua', (
      select count(*)::int from public.gimcana_enviaments s
      join public.gimcana_proves p on p.id = s.prova_id
      where p.gimcana_id = v_gimcana.id and s.estat = 'pendent')
  );
end;
$$;

alter function public.gimcana_for_event(uuid) owner to postgres;
revoke all on function public.gimcana_for_event(uuid) from public, anon;
grant execute on function public.gimcana_for_event(uuid) to authenticated, service_role;

-- ── els equips que hi ha, per triar-ne un ───────────────────────────────────
create or replace function public.gimcana_teams(p_gimcana_id uuid)
returns table (id uuid, nom text, escola text, quants int, meu boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.nom,
    e.escola,
    (select count(*)::int from public.gimcana_membres m where m.equip_id = e.id),
    e.id = private.gimcana_team(p_gimcana_id, (select auth.uid()))
  from public.gimcana_equips e
  where e.gimcana_id = p_gimcana_id
    and (select private.is_active_member())
  order by e.ordre, e.id
$$;

alter function public.gimcana_teams(uuid) owner to postgres;
revoke all on function public.gimcana_teams(uuid) from public, anon;
grant execute on function public.gimcana_teams(uuid) to authenticated, service_role;

-- ── triar equip, en mode lliure ─────────────────────────────────────────────
create or replace function public.pick_team(p_equip_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_equip   public.gimcana_equips%rowtype;
  v_gimcana public.gimcanes%rowtype;
  v_quants  int;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select * into v_equip from public.gimcana_equips where id = p_equip_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  select * into v_gimcana from public.gimcanes where id = v_equip.gimcana_id;

  if v_gimcana.mena_equips <> 'lliure' then
    return jsonb_build_object('estat', 'no_es_tria');
  end if;

  -- El bloqueig fa que dos que premen alhora no passin tots dos el topall.
  perform pg_advisory_xact_lock(hashtext('gimcana:' || v_equip.gimcana_id::text));

  if v_gimcana.topall_equip is not null then
    select count(*)::int into v_quants
    from public.gimcana_membres m
    where m.equip_id = p_equip_id and m.user_id <> v_me;

    if v_quants >= v_gimcana.topall_equip then
      return jsonb_build_object('estat', 'ple');
    end if;
  end if;

  -- Canviar d'equip és el mateix gest que triar-ne un: mentre no hagis enviat
  -- res, no hi ha res a moure.
  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  values (v_equip.gimcana_id, v_me, p_equip_id)
  on conflict (gimcana_id, user_id) do update set equip_id = excluded.equip_id;

  return jsonb_build_object('estat', 'fet', 'equip', p_equip_id);
end;
$$;

alter function public.pick_team(uuid) owner to postgres;
revoke all on function public.pick_team(uuid) from public, anon;
grant execute on function public.pick_team(uuid) to authenticated, service_role;

-- ── enviar una prova ────────────────────────────────────────────────────────
-- La foto ja és al bucket quan això es crida: la política d'insert del bucket
-- l'ha deixada passar perquè és a la carpeta de qui la puja. Aquí es decideix
-- si compta.
create or replace function public.submit_prova(
  p_prova_id uuid,
  p_path text,
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_prova   public.gimcana_proves%rowtype;
  v_team    uuid;
  v_estat   text;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select * into v_prova from public.gimcana_proves where id = p_prova_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if not private.gimcana_is_open(v_prova.gimcana_id) then
    return jsonb_build_object('estat', 'tancada');
  end if;

  -- La xarxa de seguretat del mode lliure: qui envia sense haver triat cau al
  -- més petit en comptes de rebre un error que no sap arreglar.
  v_team := private.gimcana_join_smallest(v_prova.gimcana_id, v_me);
  if v_team is null then
    return jsonb_build_object('estat', 'sense_equip');
  end if;

  perform pg_advisory_xact_lock(hashtext('prova:' || p_prova_id::text));

  -- Reenviar la mateixa cua no ha de fer dues files.
  if p_client_request_id is not null and exists (
    select 1 from public.gimcana_enviaments where client_request_id = p_client_request_id
  ) then
    return jsonb_build_object('estat', 'ja_enviada');
  end if;

  select s.estat into v_estat
  from public.gimcana_enviaments s
  where s.prova_id = p_prova_id and s.equip_id = v_team and s.estat in ('validada', 'pendent')
  limit 1;

  if v_estat = 'validada' then
    return jsonb_build_object('estat', 'ja_feta');
  end if;
  if v_estat = 'pendent' then
    return jsonb_build_object('estat', 'ja_enviada');
  end if;

  insert into public.gimcana_enviaments
    (prova_id, user_id, equip_id, path, client_request_id)
  values (p_prova_id, v_me, v_team, p_path, p_client_request_id);

  return jsonb_build_object('estat', 'enviada');
end;
$$;

alter function public.submit_prova(uuid, text, uuid) owner to postgres;
revoke all on function public.submit_prova(uuid, text, uuid) from public, anon;
grant execute on function public.submit_prova(uuid, text, uuid) to authenticated, service_role;

-- ── el marcador ─────────────────────────────────────────────────────────────
-- Suma de les proves validades per equip. De la nit i prou: no llegeix ni
-- escriu `points_log`.
create or replace function public.gimcana_scoreboard(p_gimcana_id uuid)
returns table (equip_id uuid, nom text, escola text, punts int, proves int, meu boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.nom,
    e.escola,
    coalesce(sum(p.punts) filter (where s.estat = 'validada'), 0)::int,
    count(*) filter (where s.estat = 'validada')::int,
    e.id = private.gimcana_team(p_gimcana_id, (select auth.uid()))
  from public.gimcana_equips e
  left join public.gimcana_enviaments s on s.equip_id = e.id and s.estat = 'validada'
  left join public.gimcana_proves p on p.id = s.prova_id
  where e.gimcana_id = p_gimcana_id
    and (select private.is_active_member())
  group by e.id, e.nom, e.escola, e.ordre
  order by 4 desc, e.ordre, e.id
$$;

alter function public.gimcana_scoreboard(uuid) owner to postgres;
revoke all on function public.gimcana_scoreboard(uuid) from public, anon;
grant execute on function public.gimcana_scoreboard(uuid) to authenticated, service_role;

-- ── la cua de la junta ──────────────────────────────────────────────────────
create or replace function public.admin_gimcana_queue(p_event_id uuid)
returns table (
  id         uuid,
  path       text,
  prova      text,
  punts      int,
  qui        text,
  equip      text,
  escola     text,
  quan       timestamptz,
  a_la_cua   int
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.path,
    p.titol,
    p.punts,
    pr.nombre,
    e.nom,
    e.escola,
    s.created_at,
    count(*) over ()::int
  from public.gimcana_enviaments s
  join public.gimcana_proves p on p.id = s.prova_id
  join public.gimcanes g on g.id = p.gimcana_id
  join public.profiles pr on pr.id = s.user_id
  join public.gimcana_equips e on e.id = s.equip_id
  where g.event_id = p_event_id
    and s.estat = 'pendent'
    and (select private.is_admin())
  order by s.created_at
$$;

alter function public.admin_gimcana_queue(uuid) owner to postgres;
revoke all on function public.admin_gimcana_queue(uuid) from public, anon;
grant execute on function public.admin_gimcana_queue(uuid) to authenticated, service_role;

-- ── val o no val ────────────────────────────────────────────────────────────
create or replace function public.admin_decide_prova(
  p_enviament_id uuid,
  p_val boolean,
  p_motiu text default null
)
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

  if not exists (select 1 from public.gimcana_enviaments where id = p_enviament_id) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if p_val then
    -- L'índex únic és qui decideix de debò. Si un company del mateix equip ja
    -- havia validat aquesta prova mentre la junta mirava aquesta foto, aquí
    -- salta i es contesta amb un veredicte en comptes d'un error.
    begin
      update public.gimcana_enviaments
         set estat = 'validada', validat_per = v_me, validat_a = now(), motiu = null
       where id = p_enviament_id;
    exception when unique_violation then
      update public.gimcana_enviaments
         set estat = 'rebutjada', validat_per = v_me, validat_a = now(),
             motiu = 'ja_validada'
       where id = p_enviament_id;
      return jsonb_build_object('estat', 'ja_feta');
    end;
    return jsonb_build_object('estat', 'validada');
  end if;

  update public.gimcana_enviaments
     set estat = 'rebutjada', validat_per = v_me, validat_a = now(), motiu = p_motiu
   where id = p_enviament_id;

  return jsonb_build_object('estat', 'rebutjada');
end;
$$;

alter function public.admin_decide_prova(uuid, boolean, text) owner to postgres;
revoke all on function public.admin_decide_prova(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_prova(uuid, boolean, text) to authenticated, service_role;

comment on function public.admin_decide_prova(uuid, boolean, text) is
  'Val o no val. Validar-ne dues del mateix equip i la mateixa prova no pot '
  'passar: ho para l''índex únic, i quan el para es contesta amb `ja_feta` en '
  'comptes d''un error que la pantalla no sabria explicar.';

-- ── desfer l'última ─────────────────────────────────────────────────────────
create or replace function public.admin_undo_prova(p_enviament_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  update public.gimcana_enviaments
     set estat = 'pendent', validat_per = null, validat_a = null, motiu = null
   where id = p_enviament_id;

  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;
  return jsonb_build_object('estat', 'desfeta');
end;
$$;

alter function public.admin_undo_prova(uuid) owner to postgres;
revoke all on function public.admin_undo_prova(uuid) from public, anon;
grant execute on function public.admin_undo_prova(uuid) to authenticated, service_role;

-- ── crear-la i editar-la ────────────────────────────────────────────────────
-- Tot d'una: la gimcana, els seus equips quan són per escoles, i les proves.
-- Una crida i no set, perquè la junta la munta al mòbil entre dues classes i
-- una desada a mitges deixaria un joc sense proves.
create or replace function public.admin_save_gimcana(
  p_event_id uuid,
  p_mena_equips text,
  p_proves jsonb,
  -- Sense topall per defecte: només en té sentit en mode lliure, i obligar el
  -- client a enviar un null explícit per als altres tres seria demanar-li que
  -- digui una cosa que no vol dir res.
  p_topall int default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_gimcana public.gimcanes%rowtype;
  v_escola  text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_mena_equips not in ('escoles', 'junta', 'sorteig', 'lliure') then
    raise exception 'mena d''equips desconeguda' using errcode = '22023';
  end if;

  insert into public.gimcanes (event_id, mena_equips, topall_equip, created_by)
  values (p_event_id, p_mena_equips, p_topall, v_me)
  on conflict (event_id) do update
    set mena_equips = excluded.mena_equips, topall_equip = excluded.topall_equip
  returning * into v_gimcana;

  -- En mode escoles els equips són sempre els mateixos tres i no els posa
  -- ningú a mà. Sense nom: el nom d'una escola ja viu a les traduccions.
  if p_mena_equips = 'escoles' then
    foreach v_escola in array array['politecnica', 'empresa', 'salut'] loop
      insert into public.gimcana_equips (gimcana_id, escola, ordre)
      values (v_gimcana.id, v_escola,
              case v_escola when 'politecnica' then 1 when 'empresa' then 2 else 3 end)
      on conflict (gimcana_id, escola) do nothing;
    end loop;
  end if;

  -- Les proves es reescriuen senceres. Esborrar-ne una que ja té enviaments
  -- s'emporta els enviaments per cascada, i és el que ha de passar: una prova
  -- que ja no hi és no pot seguir puntuant.
  delete from public.gimcana_proves where gimcana_id = v_gimcana.id;

  insert into public.gimcana_proves (gimcana_id, titol, descripcio, punts, ordre)
  select
    v_gimcana.id,
    x.titol,
    nullif(x.descripcio, ''),
    x.punts,
    x.ordre
  from jsonb_to_recordset(coalesce(p_proves, '[]'::jsonb))
    as x(titol text, descripcio text, punts int, ordre int);

  return jsonb_build_object('estat', 'desada', 'id', v_gimcana.id);
end;
$$;

alter function public.admin_save_gimcana(uuid, text, jsonb, int) owner to postgres;
revoke all on function public.admin_save_gimcana(uuid, text, jsonb, int) from public, anon;
grant execute on function public.admin_save_gimcana(uuid, text, jsonb, int)
  to authenticated, service_role;

-- ── els equips, quan els fa la junta ────────────────────────────────────────
create or replace function public.admin_save_teams(p_gimcana_id uuid, p_noms text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom text;
  v_i   int := 0;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_proves p on p.id = s.prova_id
    where p.gimcana_id = p_gimcana_id and s.estat = 'validada'
  ) then
    return jsonb_build_object('estat', 'ja_jugada');
  end if;

  delete from public.gimcana_equips where gimcana_id = p_gimcana_id;

  foreach v_nom in array coalesce(p_noms, array[]::text[]) loop
    v_i := v_i + 1;
    insert into public.gimcana_equips (gimcana_id, nom, ordre)
    values (p_gimcana_id, v_nom, v_i);
  end loop;

  return jsonb_build_object('estat', 'desats', 'quants', v_i);
end;
$$;

alter function public.admin_save_teams(uuid, text[]) owner to postgres;
revoke all on function public.admin_save_teams(uuid, text[]) from public, anon;
grant execute on function public.admin_save_teams(uuid, text[]) to authenticated, service_role;

-- ── remenar ─────────────────────────────────────────────────────────────────
-- Reparteix a l'atzar qui ha fitxat aquella nit. Es nega a fer-ho si ja hi ha
-- cap prova validada: remenar els equips a mitja partida invalidaria el
-- marcador i no hi hauria manera d'explicar-ho a ningú.
create or replace function public.admin_shuffle_teams(p_gimcana_id uuid, p_quants int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- `v_i` no es declara: el `for` de sota es fa la seva pròpia variable i
  -- declarar-la aquí n'hi hauria dues amb el mateix nom.
  v_event uuid;
  v_ids   uuid[];
  v_gent  int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_quants < 2 or p_quants > 12 then
    raise exception 'entre dos i dotze equips' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_proves p on p.id = s.prova_id
    where p.gimcana_id = p_gimcana_id and s.estat = 'validada'
  ) then
    return jsonb_build_object('estat', 'ja_jugada');
  end if;

  select event_id into v_event from public.gimcanes where id = p_gimcana_id;
  if v_event is null then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  delete from public.gimcana_equips where gimcana_id = p_gimcana_id;

  for v_i in 1..p_quants loop
    insert into public.gimcana_equips (gimcana_id, nom, ordre)
    values (p_gimcana_id, null, v_i);
  end loop;

  select array_agg(id order by ordre) into v_ids
  from public.gimcana_equips where gimcana_id = p_gimcana_id;

  -- Repartits en rodona sobre un ordre a l'atzar: així els equips queden
  -- igualats encara que la gent no sigui múltiple del nombre d'equips.
  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  select
    p_gimcana_id,
    a.user_id,
    v_ids[1 + ((row_number() over (order by random()) - 1)::int % p_quants)]
  from public.attendances a
  where a.event_id = v_event and a.estado = 'asistio'
  on conflict (gimcana_id, user_id) do update set equip_id = excluded.equip_id;

  get diagnostics v_gent = row_count;
  return jsonb_build_object('estat', 'remenats', 'equips', p_quants, 'gent', v_gent);
end;
$$;

alter function public.admin_shuffle_teams(uuid, int) owner to postgres;
revoke all on function public.admin_shuffle_teams(uuid, int) from public, anon;
grant execute on function public.admin_shuffle_teams(uuid, int) to authenticated, service_role;

comment on function public.admin_shuffle_teams(uuid, int) is
  'Reparteix a l''atzar qui ha fitxat. Es nega si ja hi ha cap prova validada: '
  'remenar a mitja partida invalidaria el marcador.';

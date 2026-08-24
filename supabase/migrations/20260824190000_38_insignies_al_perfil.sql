-- Les insígnies, tal com es veuran.
--
-- La migració 37 va deixar la mecànica: qui es guanya què, quan, i que no es
-- retira mai. Els dissenys demanen tres coses més, i totes tres són de
-- pantalla i no de mecànica:
--
--   CADA INSÍGNIA DIU D'ON VE. La targeta guanyada no ensenya una data pelada
--   sinó «Can Bravo · desembre»: l'activitat que la va provocar. Això no es pot
--   deduir de `earned_at` —una insígnia de deu activitats no sap quina va ser
--   la desena si després n'hi ha hagut vint— o sigui que s'ha de desar amb ella.
--
--   QUANTA GENT LA TÉ. El full de detall diu «la tenen 23 de 97», que és el que
--   fa que una insígnia sigui una cosa compartida i no un adhesiu privat.
--
--   I EL BACKFILL. La 37 ja ha repartit insígnies a producció, i totes tenen
--   l'esdeveniment buit. Si no s'omplen aquí, la gent que ja en té les veurà
--   sense res sota el títol per sempre, perquè `grant_badges` no torna a tocar
--   una fila que ja existeix.
--
-- EL QUE NO CANVIA: qui pot llegir la taula. Els dissenys diuen «públiques al
-- perfil», però no hi ha cap pantalla del perfil d'un altre soci a tota l'app;
-- l'única cosa pública que es veu de debò és el recompte, i el recompte el dóna
-- una funció. És exactament com funcionen els punts: el rànquing els ensenya
-- sense que `points_log` sigui llegible per ningú. Obrir la taula seria donar
-- una capacitat que cap pantalla necessita.

-- ── d'on ve cada insígnia ───────────────────────────────────────────────────
-- Una sola definició de «quina activitat la va provocar», perquè la fan servir
-- dues coses: repartir-ne de noves i omplir les que ja hi havia. Si visqués als
-- dos llocs, algun dia dirien coses diferents.
--
-- Les de comptar surten de la mateixa fila que les fa certes: `n = 5` no
-- existeix fins que hi ha cinc activitats, i quan existeix ja és la cinquena.
-- No hi ha cap comptador ni cap condició repetida.
--
-- `de_tot` torna null a posta: són tres activitats de menes diferents i cap
-- d'elles n'és «la» que la va guanyar. La targeta ensenya la descripció.
create or replace function private.badge_event(p_user uuid, p_codi text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with fets as (
    select
      a.event_id,
      e.tipo,
      e.starts_at,
      a.entry_photo_url,
      a.exit_photo_url,
      row_number() over (order by e.starts_at, e.id) as n
    from public.attendances a
    join public.events e on e.id = a.event_id
    where a.user_id = p_user and a.estado = 'asistio'
  )
  select case p_codi
    when 'primera'     then (select f.event_id from fets f where f.n = 1)
    when 'cinc'        then (select f.event_id from fets f where f.n = 5)
    when 'deu'         then (select f.event_id from fets f where f.n = 10)
    when 'vint_i_cinc' then (select f.event_id from fets f where f.n = 25)

    when 'cap_de_setmana' then (
      select f.event_id from fets f
       where f.tipo = 'casa_rural' order by f.starts_at, f.event_id limit 1)

    when 'entrada_i_sortida' then (
      select f.event_id from fets f
       where f.entry_photo_url is not null and f.exit_photo_url is not null
       order by f.starts_at, f.event_id limit 1)

    when 'a_muntar' then (
      select l.event_id from public.points_log l
       where l.user_id = p_user and l.motivo = 'montaje' and l.puntos > 0
       order by l.created_at, l.id limit 1)

    -- Una proposta pot no tenir encara cap activitat lligada. La targeta se'n
    -- surt igual: ensenya la descripció, com `de_tot`.
    when 'va_ser_idea_meva' then (
      select p.event_id from public.proposals p
       where p.user_id = p_user and p.estat = 'acceptada'
       order by p.created_at, p.id limit 1)

    when 'al_volant' then (
      select r.event_id from public.rides r
        join public.ride_seats s on s.ride_id = r.id
       where r.driver_id = p_user and s.estat = 'a_dins' and s.user_id <> r.driver_id
       order by s.created_at, r.id limit 1)

    when 'copilot' then (
      select r.event_id from public.ride_seats s
        join public.rides r on r.id = s.ride_id
       where s.user_id = p_user and s.estat = 'a_dins' and r.driver_id <> p_user
       order by s.created_at, r.id limit 1)

    when 'de_les_primeres' then (
      select a.event_id from public.attendances a
        join public.events e on e.id = a.event_id
       where a.user_id = p_user
         and a.estado = 'asistio'
         and a.checked_in_at is not null
         and (select count(*) from public.attendances b
               where b.event_id = a.event_id and b.checked_in_at is not null) >= 10
         and (select count(*) from public.attendances b
               where b.event_id = a.event_id
                 and b.checked_in_at is not null
                 and b.checked_in_at < a.checked_in_at) < 5
       order by e.starts_at, a.event_id limit 1)

    else null
  end
$$;

alter function private.badge_event(uuid, text) owner to postgres;
revoke all on function private.badge_event(uuid, text) from public, anon, authenticated;

comment on function private.badge_event(uuid, text) is
  'Quina activitat va provocar una insígnia, o null quan no n''hi ha cap de '
  'sola. Una definició i prou: la fan servir repartir-ne de noves i omplir les '
  'que ja hi havia.';

-- ── l'activitat, a la taula ─────────────────────────────────────────────────
alter table public.badges
  add column if not exists event_id uuid references public.events (id) on delete set null;

comment on column public.badges.event_id is
  'On la vas guanyar, per poder-ho dir a la targeta. `on delete set null` i no '
  'cascade: si algú esborra una activitat, la insígnia es queda i el que es '
  'perd és la llegenda de sota, que és la part que es pot perdre.';

create index if not exists badges_event_id_idx on public.badges (event_id);

-- ── repartir-les, ara amb l'activitat ───────────────────────────────────────
-- La condició de cada insígnia no canvia ni una lletra respecte de la 37:
-- l'única diferència és la columna que s'hi insereix.
create or replace function private.grant_badges(p_user uuid)
returns setof text
language sql
volatile
security definer
set search_path = ''
as $$
  with fets as (
    select a.event_id, e.tipo, a.entry_photo_url, a.exit_photo_url
    from public.attendances a
    join public.events e on e.id = a.event_id
    where a.user_id = p_user and a.estado = 'asistio'
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

-- ── les que ja s'havien repartit ────────────────────────────────────────────
-- Una sola vegada, per a tothom qui ja en tenia abans d'aquesta migració.
-- `grant_badges` no hi arribaria mai: el seu `on conflict do nothing` deixa en
-- pau les files que ja existeixen, que és justament el que ha de fer.
update public.badges b
   set event_id = private.badge_event(b.user_id, b.codi)
 where b.event_id is null;

-- ── les meves, amb la llegenda de sota ──────────────────────────────────────
-- `create or replace` no pot canviar les columnes d'un `returns table`: fa
-- «cannot change return type of existing function». Cal deixar-la anar primer.
drop function if exists public.my_badges();

create function public.my_badges()
returns table (
  codi      text,
  earned_at timestamptz,
  nova      boolean,
  event_id  uuid,
  titol     text,
  starts_at timestamptz
)
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

  perform private.grant_badges(v_me);

  return query
    select b.codi, b.earned_at, b.seen_at is null, b.event_id, e.titulo, e.starts_at
    from public.badges b
    left join public.events e on e.id = b.event_id
    where b.user_id = v_me
    order by b.earned_at desc, b.codi;
end;
$$;

alter function public.my_badges() owner to postgres;
revoke all on function public.my_badges() from public, anon;
grant execute on function public.my_badges() to authenticated, service_role;

comment on function public.my_badges() is
  'Reparteix les que toquin i les torna totes, amb l''activitat on es van '
  'guanyar. `nova` vol dir encara no ensenyada, i es tanca amb '
  'mark_badges_seen() quan de debò s''ha vist: apagar-ho aquí mateix perdria la '
  'celebració si la pantalla no arriba a carregar-se.';

-- ── qui més la té ───────────────────────────────────────────────────────────
-- Definer, i totes de cop en comptes d'una per crida: la graella en vol deu i
-- deu peticions per pintar una pantalla és el que aquesta app no fa enlloc.
--
-- La cara d'algú amagat del rànquing no surt, però la persona sí que compta.
-- És el mateix criteri que `ranking_escoles`: ningú és identificable dins d'una
-- suma, i «la tenen 23» amb 22 cares seria una manera rebuscada de dir qui és
-- el que falta.
create or replace function public.badge_holders()
returns table (codi text, quants int, total int, cares text[])
language sql
stable
security definer
set search_path = ''
as $$
  with socis as (
    select count(*)::int as n from public.profiles where estat = 'actiu'
  )
  select
    b.codi,
    count(*)::int,
    (select n from socis),
    (array_remove(array_agg(p.avatar_url) filter (
       where not p.hide_from_ranking and p.avatar_url is not null), null))[1:3]
  from public.badges b
  join public.profiles p on p.id = b.user_id
  where p.estat = 'actiu'
    and (select private.is_active_member())
  group by b.codi
$$;

alter function public.badge_holders() owner to postgres;
revoke all on function public.badge_holders() from public, anon;
grant execute on function public.badge_holders() to authenticated, service_role;

comment on function public.badge_holders() is
  'Quanta gent té cada insígnia, sobre quants socis actius, i fins a tres '
  'cares. Definer perquè `badges` només és llegible per un mateix: és el mateix '
  'patró que el rànquing, que ensenya punts sense que points_log sigui obert. '
  'El filtre d''actiu és el que fa que la crida no digui res a qui ja no hi és.';

-- Ratxes i insígnies.
--
-- PER QUÈ EXISTEIXEN. Al gener la gent deixa de venir i no és perquè les
-- festes siguin pitjors. Les dues coses d'aquest fitxer són l'única resposta
-- que es pot donar amb les dades que ja hi ha: recordar-te que hi anaves, i
-- reconèixer el que ja has fet.
--
-- LA RATXA NO ES DESA. Es calcula cada cop que es demana, a partir dels
-- fitxatges que ja hi són. Un comptador desat a `profiles` es desincronitza el
-- dia que la junta desfà un fitxatge amb `admin_undo_checkin`, i llavors l'app
-- diu una xifra que la base no pot justificar. És el mateix motiu pel qual
-- `points_log` és un registre i no un saldo.
--
-- LES INSÍGNIES SÍ ES DESEN, i el motiu és un de sol: l'hora. Quan la vas
-- guanyar no es pot deduir de res —una insígnia de deu activitats no sap quina
-- va ser la desena si després n'hi ha hagut vint— i sense l'hora no hi ha ni
-- ordre ni cap moment de guanyar-la. La taula és només d'inserir: mai s'esborra
-- una insígnia. Si algú deixa de complir les condicions —la junta li desfà un
-- fitxatge i torna a nou activitats— la insígnia es queda. Treure-la seria
-- dir-li a algú que allò que va fer no va passar.
--
-- EL CATÀLEG VIU AL CODI I NO A UNA TAULA. La condició d'una insígnia és SQL;
-- posar l'etiqueta en una taula i la condició en una funció és garantir que
-- algun dia diguin coses diferents. La llista de codis és el `check` de sota, i
-- els noms que es veuen són a les traduccions del client, com tota la resta de
-- text.

-- ── els esdeveniments que compten per a la teva ratxa ───────────────────────
-- «Activitats seguides», no «setmanes seguides». Les activitats són irregulars
-- —dues una setmana i cap en tres— i comptar setmanes castigaria la gent per un
-- calendari que no decideix ella.
--
-- Un esdeveniment només compta quan ja no s'hi pot fitxar, i per això reutilitza
-- la finestra de la migració 36 en comptes de mirar `starts_at`: durant la
-- festa, encara dret a la porta i sense haver premut el botó, la teva ratxa
-- encara no s'ha trencat.
--
-- I es descarten els tres estats en què la comi et va dir que no —llista
-- d'espera, sol·licitud sense resposta i sol·licitud rebutjada. Trencar la
-- ratxa d'algú perquè una activitat estava plena seria cobrar-li a ell una
-- decisió nostra.
create or replace function private.streak_rows(p_user uuid)
returns table (event_id uuid, starts_at timestamptz, hi_va_anar boolean)
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
  -- L'id desempata: dues activitats el mateix minut han de sortir sempre en el
  -- mateix ordre, o la ratxa canviaria de valor entre dues crides iguals.
  order by e.starts_at, e.id
$$;

alter function private.streak_rows(uuid) owner to postgres;
revoke all on function private.streak_rows(uuid) from public, anon, authenticated;

comment on function private.streak_rows(uuid) is
  'Les activitats passades que compten per a una persona, en ordre, i si hi va '
  'anar. Decidir què compta és aquí i el recompte a my_streak(), perquè la '
  'definició és la part discutible i el bucle no.';

-- ── la ratxa ───────────────────────────────────────────────────────────────
create or replace function public.my_streak()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me       uuid := (select auth.uid());
  r          record;
  v_run      int := 0;
  v_actual   int := 0;
  v_millor   int := 0;
  v_perduda  int := 0;
  v_trencada timestamptz;
  v_compten  int := 0;
  v_hi_vas   int := 0;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  for r in select * from private.streak_rows(v_me) loop
    v_compten := v_compten + 1;
    if r.hi_va_anar then
      v_run := v_run + 1;
      v_hi_vas := v_hi_vas + 1;
      if v_run > v_millor then v_millor := v_run; end if;
    else
      -- Només es guarda el que s'ha trencat si hi havia alguna cosa a trencar:
      -- «has perdut una ratxa de zero» és renyar algú per no haver vingut mai.
      if v_run > 0 then
        v_perduda  := v_run;
        v_trencada := r.starts_at;
      end if;
      v_run := 0;
    end if;
  end loop;

  v_actual := v_run;

  -- Amb una ratxa viva no hi ha res de trencat a explicar. Ensenyar totes dues
  -- coses alhora faria que la pantalla renyés i felicités a la vegada.
  if v_actual > 0 then
    v_perduda  := 0;
    v_trencada := null;
  end if;

  return jsonb_build_object(
    'actual',      v_actual,
    'millor',      v_millor,
    'perduda',     v_perduda,
    'trencada_el', v_trencada,
    'compten',     v_compten,
    'hi_has_anat', v_hi_vas
  );
end;
$$;

alter function public.my_streak() owner to postgres;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated, service_role;

comment on function public.my_streak() is
  'La teva ratxa: `actual`, `millor`, i si s''ha trencat, quant valia i quan. '
  'Es calcula sempre, mai es desa. No diu res de si està «en perill»: això '
  'depèn de si hi ha una activitat oberta, cosa que la pantalla ja sap.';

-- ── insígnies ──────────────────────────────────────────────────────────────
create table if not exists public.badges (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  codi      text not null check (codi in (
              'primera', 'cinc', 'deu', 'vint_i_cinc',
              'cap_de_setmana', 'de_tot',
              'al_volant', 'copilot',
              'a_muntar', 'va_ser_idea_meva',
              'entrada_i_sortida', 'de_les_primeres'
            )),
  earned_at timestamptz not null default now(),
  -- Null mentre no s'hagi ensenyat. És el que permet celebrar-la una vegada i
  -- prou, i també celebrar-ne una que has guanyat sense fer res: «de les
  -- primeres» te la dóna el desè que fitxa, no tu.
  seen_at   timestamptz,
  primary key (user_id, codi)
);

comment on table public.badges is
  'Només d''inserir. Una insígnia guanyada no es retira mai, ni quan les '
  'condicions deixen de complir-se: dir-li a algú que allò que va fer no va '
  'passar és pitjor que un comptador desquadrat. El catàleg és el check de '
  'codi i les etiquetes són a les traduccions.';

alter table public.badges enable row level security;

create policy badges_select_own on public.badges
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Cap grant d'escriptura per a `authenticated`: l'única manera d'arribar-hi és
-- private.grant_badges(), que decideix qui té dret a què. Sense INSERT, cap
-- petició de PostgREST pot regalar-se una insígnia ni que hi hagués una
-- política oberta.
revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;
grant select, insert, update, delete on public.badges to service_role;

-- ── qui es guanya què ──────────────────────────────────────────────────────
-- Retroactiu per construcció: la primera crida després de desplegar reparteix
-- tot el que la gent ja tenia guanyat des del setembre.
--
-- `on conflict do nothing` la fa idempotent, o sigui que es pot cridar a cada
-- obertura de pantalla sense pensar-hi, i el `returning` diu què era nou.
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

    -- Conduir no deixa cap rastre a `points_log` —el seu check no accepta cap
    -- motiu de cotxes— o sigui que la font és el cotxe mateix. I amb algú a
    -- dins: un cotxe ofert i buit no és haver portat ningú.
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
  insert into public.badges (user_id, codi)
  select p_user, codi from guanyades
  on conflict (user_id, codi) do nothing
  returning codi
$$;

alter function private.grant_badges(uuid) owner to postgres;
revoke all on function private.grant_badges(uuid) from public, anon, authenticated;

comment on function private.grant_badges(uuid) is
  'Reparteix el que toqui i torna només el que era nou. Idempotent i '
  'retroactiva. Cap crida seva pot donar una insígnia que no s''hagi guanyat: '
  'la condició és la consulta, no el paràmetre.';

-- ── les meves ──────────────────────────────────────────────────────────────
create or replace function public.my_badges()
returns table (codi text, earned_at timestamptz, nova boolean)
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
    select b.codi, b.earned_at, b.seen_at is null
    from public.badges b
    where b.user_id = v_me
    order by b.earned_at desc, b.codi;
end;
$$;

alter function public.my_badges() owner to postgres;
revoke all on function public.my_badges() from public, anon;
grant execute on function public.my_badges() to authenticated, service_role;

comment on function public.my_badges() is
  'Reparteix les que toquin i les torna totes. `nova` vol dir encara no '
  'ensenyada, i es tanca amb mark_badges_seen() quan de debò s''ha vist: '
  'apagar-ho aquí mateix perdria la celebració si la pantalla no arriba a '
  'carregar-se.';

create or replace function public.mark_badges_seen()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_n  int;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  update public.badges set seen_at = now()
   where user_id = v_me and seen_at is null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

alter function public.mark_badges_seen() owner to postgres;
revoke all on function public.mark_badges_seen() from public, anon;
grant execute on function public.mark_badges_seen() to authenticated, service_role;

comment on function public.mark_badges_seen() is
  'Marca com a vistes les insígnies noves i diu quantes n''hi havia.';

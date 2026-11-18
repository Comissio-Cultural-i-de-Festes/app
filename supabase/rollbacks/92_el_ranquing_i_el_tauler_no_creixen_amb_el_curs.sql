-- Rollback de la migració 92. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna les quatre funcions als cossos d'abans —`ranking_escoles_period` de la
-- 11, `streak_rows` de la 48, `drifting` de la 41 i `admin_dashboard` de la 82—
-- i esborra les dues que la 92 va afegir. Cap firma ni cap permís canvia, o
-- sigui que el client no se n'assabenta: el rànquing i el tauler tornen a dir
-- el mateix, només que tornen a tardar el que tardaven.
--
-- ORDRE DINS DEL FITXER: primer els cossos vells, que ja no criden
-- `streak_rows_for` ni `drifting_among`, i després el `drop`. Al revés, entre
-- les dues coses hi hauria un moment en què el tauler i la ratxa criden una
-- funció que no existeix.
--
-- `supabase/tests/497_...` es posarà vermell, que és el que ha de fer: compara
-- la definició vella amb la que ja no hi és.

create or replace function public.ranking_escoles_period(
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
security definer
set search_path = ''
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
  -- How many different events a school actually turned up to, which is the
  -- number that says whether a total came from one big night or from showing
  -- up all term. Counted here rather than in the lateral above, because that
  -- one runs per member and would only ever see one member's events at a time.
  -- Manual points have no event and are correctly not counted.
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

revoke all on function public.ranking_escoles_period(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.ranking_escoles_period(timestamptz, timestamptz)
  to authenticated, service_role;

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

comment on function private.streak_rows(uuid) is
  'Les activitats passades que compten per a una persona, en ordre, i si hi va '
  'anar. Decidir què compta és aquí i el recompte a my_streak(), perquè la '
  'definició és la part discutible i el bucle no.';

create or replace function private.drifting(p_user uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with files as (
    select r.hi_va_anar, row_number() over (order by r.starts_at desc) as recent
    from private.streak_rows(p_user) r
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

alter function private.drifting(uuid, timestamptz, timestamptz) owner to postgres;
revoke all on function private.drifting(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

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

  -- D'on surten els punts. El que es llegeix és que gairebé tot ve d'assistir,
  -- i per tant que muntar i portar gent són punts fàcils de repartir al gener.
  --
  -- SENSE FILTRE DE SIGNE (migració 80): la suma per motiu ja és un `sum()`, i
  -- el total d'aquesta llista ha de ser el del llibre major i no la meitat
  -- bona. Un motiu que resta és informació —un avís que es manté, un ajust a mà
  -- que baixa— i surt amb el seu signe.
  --
  -- `avis_retirat` NO ÉS UN MOTIU D'AQUESTA LLISTA (migració 80): s'agrupa sota
  -- `avis`, que és el que ell desfà.
  --
  -- LA DATA D'UN MOVIMENT D'AVÍS ÉS LA DE L'AVÍS, no la de la fila. La
  -- compensatòria s'escriu amb `now()` i l'avís pot ser de fa dos cursos:
  -- comptades pel seu propi dia, les dues cares del mateix avís cauen en
  -- finestres diferents i cap de les dues no diu la veritat. És la mateixa
  -- regla que el sostre del curs d'`avisa()` (migració 78) i s'escriu igual:
  -- subconsulta i no join, perquè `avisos.points_log_id` no té índex únic i un
  -- join hi duplicaria la fila el dia que dues files apuntessin al mateix
  -- moviment.
  --
  -- I EL GRUP `avis` NO POT SER POSITIU. Una fila d'avís sense cap avís que hi
  -- apunti s'ancora al seu propi dia —la 78 hi arriba igual— i una òrfena
  -- positiva tornaria a ser una barra al gràfic. El `least` fa que «retirar un
  -- càstig no és guanyar punts» sigui una propietat d'aquesta funció i no de
  -- les dades. El preu, que és real: amb una òrfena positiva a dins, la suma
  -- d'aquesta llista deixa de quadrar amb el llibre major del període.
  --
  -- `vegades` COMPTA AVISOS, NO FILES (migració 80): un avís retirat en són
  -- dues. Un grup que queda a zero i sense cap avís no ha passat, i per això no
  -- surt; als altres motius `vegades` és el `count(*)` del grup i no hi pot ser
  -- mai zero.
  select coalesce(jsonb_agg(x order by x.punts desc), '[]'::jsonb) into v_motius
  from (
    select
      g.motivo,
      case when g.motivo = 'avis' then least(g.punts, 0) else g.punts end as punts,
      g.vegades
    from (
      select
        case when l.motivo = 'avis_retirat' then 'avis' else l.motivo end as motivo,
        sum(l.puntos)::int as punts,
        count(*) filter (where l.motivo <> 'avis_retirat')::int as vegades
      from (
        select
          pl.motivo,
          pl.puntos,
          case
            when pl.motivo in ('avis', 'avis_retirat') then coalesce(
              (select a.created_at
                 from public.avisos a
                where a.points_log_id = pl.id
                   or a.retirat_points_log_id = pl.id
                limit 1),
              pl.created_at)
            else pl.created_at
          end as quan
        from public.points_log pl
      ) l
      where (p_from is null or l.quan >= p_from)
        and (p_to is null or l.quan < p_to)
      group by case when l.motivo = 'avis_retirat' then 'avis' else l.motivo end
    ) g
  ) x
  where x.punts <> 0 or x.vegades <> 0;

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

drop function if exists private.drifting_among(uuid[], timestamptz, timestamptz);
drop function if exists private.streak_rows_for(uuid[]);

comment on function private.checkin_open_at(uuid) is null;

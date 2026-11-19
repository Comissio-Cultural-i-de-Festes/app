-- El rànquing d'escoles i el tauler de la junta, amb un curs sencer a dins.
--
-- Amb 300 socis i un curs de punts i fitxatges, `ranking_escoles_period` tarda
-- uns 180 ms i `admin_dashboard` entre 0,6 i 0,8 s. Cap de les dues coses és un
-- error de resultat; totes dues creixen amb cada setmana que passa, i el curs
-- que ve serien el doble. Aquesta migració no canvia cap firma, cap permís ni
-- cap fila de sortida: només com s'hi arriba. `supabase/tests/497_...` compara
-- les definicions velles amb aquestes, fila a fila, en els casos que costen.
--
-- ── EL RÀNQUING D'ESCOLES ERA SOCIS × PUNTS ─────────────────────────────────
-- El CTE `scored` es feia servir dues vegades, o sigui que Postgres el
-- materialitzava, i el `left join lateral` de cada soci el recorria sencer per
-- quedar-se amb les seves files: 300 socis per 6.000 punts són 1,8 milions de
-- comparacions per tornar tres files. Ara la finestra es talla una vegada, els
-- punts se sumen per soci amb un sol `group by` i el soci s'hi enganxa després.
--
-- EL `::int` ES QUEDA ON ERA. Abans cada soci sumava els seus punts i els
-- convertia a `int`, i l'escola sumava aquests `int`. Ara també: `per_soci`
-- converteix i `per_escola` suma. Sumar-ho tot de cop donaria el mateix número
-- però desbordaria en un altre lloc, i el que es promet aquí és que no canvia
-- res.
--
-- ── EL TAULER ERA UNA CONSULTA PER ESDEVENIMENT I PER SOCI ──────────────────
-- Dues coses, i calen totes dues.
--
-- 1. LA FINESTRA DE FITXAR, EN LÍNIA. `streak_rows` decidia si una activitat
--    ja havia passat amb `private.checkin_open_at(e.id)`, que és `security
--    definer` i té `from`: Postgres no la pot desplegar dins de la consulta, i
--    cada crida és una consulta a part sobre `events` i `event_details`. Ara hi
--    ha un `left join` a `event_details` i l'expressió escrita al lloc. ÉS LA
--    MATEIXA EXPRESSIÓ, `tsrange` inclòs, i no una simplificació: `upper()`
--    d'un rang buit és NULL i un rang amb el final abans del principi és un
--    error, i tots dos casos han de fer el que feien.
--
--    EL QUE COSTA: la finestra queda escrita a dos llocs. `checkin_open_at`
--    continua sent la del fitxatge, la gimcana i la porta, i no es toca. Si
--    algun dia canvia, la 497 se'n queixa: compara la ratxa nova amb una còpia
--    de la vella que crida `checkin_open_at` de debò.
--
--    DESCARTAT: fer `checkin_open_at` desplegable. Només es desplega una funció
--    SQL que no és `security definer`, i aquesta ho ha de ser: llegeix
--    `event_details.ends_at`, que un soci no veu abans de la revelació, i
--    `events` de reunions de junta, que un soci no veu mai. Com a invocadora,
--    la finestra d'un mateix esdeveniment dependria de qui la demana.
--
-- 2. TOTS ELS SOCIS D'UNA VEGADA. Amb la finestra en línia, una crida a
--    `streak_rows` passa de mil·lisegons a dècimes, però el tauler en feia una
--    per soci actiu (a `drifting`) i dues més per cada despenjat, i a PG 17 una
--    funció SQL torna a planificar la seva consulta a cada crida: més planificar
--    que executar. Ara la definició viu a `streak_rows_for(uuid[])`, que fa
--    tots els socis demanats en una sola consulta, i `drifting_among(uuid[],
--    …)`, que en surt dels despenjats i el seu recompte. `streak_rows(uuid)` i
--    `drifting(uuid, …)` es queden amb la seva firma, i són la mateixa
--    definició cridada amb un sol soci: el perfil, la ratxa i el tauler no
--    poden dir coses diferents de la mateixa persona, que és el que la 41 volia
--    protegir quan va fer servir `streak_rows` en comptes d'escriure-ne una
--    altra.
--
--    DOS DESEMPATS NOUS, i són l'únic que pot canviar el resultat. `drifting`
--    numerava les activitats amb `order by starts_at desc` i prou, o sigui que
--    dues activitats al mateix minut sortien en un ordre qualsevol, i quina era
--    «l'última» depenia de l'ordenació del moment. Ara l'id desempata, com ja
--    feia `streak_rows`. I la llista del tauler, que s'ordenava per l'última
--    vegada que cadascú va venir i prou, també desempata per id. En tots dos
--    casos, sense empat no canvia res.
--
-- `admin_dashboard` ES REESCRIU SENCER perquè Postgres no sap editar el cos
-- d'una funció. El cos és el de la 82; canvia el bloc dels despenjats i, al
-- de les escoles, el recompte d'«actius»: era un `exists` per soci (280 socis
-- per 15 activitats del mes, 4.000 cerques a l'índex) i ara és una sola
-- llista. Els altres tres blocs són els de la 82 lletra per lletra.
--
-- CAP ÍNDEX NOU. Els plans d'abans i de després llegeixen `points_log`,
-- `events` i `event_details` sencers (pocs milers de files, tot a memòria) i
-- `attendances` per l'índex únic `(user_id, event_id)`, que ja hi és. El que
-- costava era quantes vegades es feia, no com.

-- ── el rànquing d'escoles ───────────────────────────────────────────────────
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
    select pl.user_id, pl.event_id, pl.puntos
      from public.points_log pl
      left join public.events e on e.id = pl.event_id
     where (p_from is null or coalesce(e.starts_at, pl.created_at) >= p_from)
       and (p_to   is null or coalesce(e.starts_at, pl.created_at) <  p_to)
  ),
  membres as (
    select p.id, p.escola
      from public.profiles p
     where p.estat = 'actiu' and p.escola is not null
  ),
  per_soci as (
    select s.user_id, sum(s.puntos)::int as punts
      from scored s
     group by s.user_id
  ),
  per_escola as (
    select
      m.escola,
      count(*)::int as membres,
      coalesce(sum(ps.punts), 0)::int as punts_totals
    from membres m
    left join per_soci ps on ps.user_id = m.id
    group by m.escola
  ),
  -- How many different events a school actually turned up to, which is the
  -- number that says whether a total came from one big night or from showing
  -- up all term. Manual points have no event and are correctly not counted.
  esdeveniments_escola as (
    select m.escola, count(distinct s.event_id)::int as esdeveniments
      from membres m
      join scored s on s.user_id = m.id
     where s.event_id is not null
     group by m.escola
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

-- Tornats a escriure pel motiu de sempre: el dia que això s'apliqui on la
-- funció no hi sigui, el `create` donaria l'EXECUTE a PUBLIC.
revoke all on function public.ranking_escoles_period(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.ranking_escoles_period(timestamptz, timestamptz)
  to authenticated, service_role;

-- ── la ratxa, per a molts socis alhora ──────────────────────────────────────
-- La definició de «quines activitats comptaven per a aquesta persona». Les
-- condicions són les de la 48 una per una; el que canvia és que `p_user` passa
-- a ser una llista i la finestra de fitxar s'escriu al lloc.
create function private.streak_rows_for(p_users uuid[])
returns table(user_id uuid, event_id uuid, starts_at timestamptz, hi_va_anar boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    e.id,
    e.starts_at,
    coalesce(a.estado, 'no') = 'asistio'
  from public.profiles p
  -- El que passava abans que fossis soci no és teu.
  join public.events e on e.starts_at >= p.created_at
  left join public.event_details d on d.event_id = e.id
  left join public.attendances a
    on a.event_id = e.id and a.user_id = p.id
  where p.id = any(p_users)
    and e.published
    -- `upper(private.checkin_open_at(e.id))`, en línia: una crida per
    -- activitat i per soci era tot el temps del tauler. Ha de ser idèntica a
    -- aquella funció, `tsrange` inclòs, i la 497 ho comprova.
    and upper(tsrange(
          (e.starts_at - interval '1 hour') at time zone 'UTC',
          (coalesce(d.ends_at, e.starts_at + interval '6 hours') + interval '1 hour') at time zone 'UTC'
        )) < (now() at time zone 'UTC')
    and coalesce(a.estado, 'no') not in ('espera', 'sollicitat', 'rebutjat')
    -- I una reunió de junta no és una activitat a què ningú de fora pogués
    -- venir: comptar-la trencaria la ratxa de tota l'associació per una cosa
    -- que no els va passar. Migració 48.
    and e.abast <> 'junta'
$$;

alter function private.streak_rows_for(uuid[]) owner to postgres;
revoke all on function private.streak_rows_for(uuid[]) from public, anon, authenticated;

comment on function private.streak_rows_for(uuid[]) is
  'Les activitats que comptaven per a cada soci de la llista, i si hi va anar. '
  'És l''única definició: streak_rows() i drifting_among() en surten. Repeteix '
  'en línia la finestra de private.checkin_open_at() (migració 92).';

create or replace function private.streak_rows(p_user uuid)
returns table(event_id uuid, starts_at timestamptz, hi_va_anar boolean)
language sql
stable
security definer
set search_path = ''
as $$
  -- L'id desempata: dues activitats el mateix minut han de sortir sempre en el
  -- mateix ordre, o la ratxa canviaria de valor entre dues crides iguals.
  select r.event_id, r.starts_at, r.hi_va_anar
    from private.streak_rows_for(array[p_user]) r
   order by r.starts_at, r.event_id
$$;

alter function private.streak_rows(uuid) owner to postgres;
revoke all on function private.streak_rows(uuid) from public, anon, authenticated;

comment on function private.streak_rows(uuid) is
  'Les activitats passades que compten per a una persona, en ordre, i si hi va '
  'anar. Què compta es decideix a private.streak_rows_for() (migració 92) i el '
  'recompte a my_streak(), perquè la definició és la part discutible i el '
  'bucle no.';

-- ── qui s'està despenjant, per a molts socis alhora ─────────────────────────
-- Les tres condicions de la 41, sense tocar-ne cap: quatre activitats de
-- mínim, cap de les dues últimes, i la meitat o més de les d'abans. Torna també
-- els dos recomptes que el tauler ensenya, que són les mateixes files.
create function private.drifting_among(
  p_users uuid[],
  p_from timestamptz,
  p_to timestamptz
)
returns table(user_id uuid, hi_va_anar int, comptaven int)
language sql
stable
security definer
set search_path = ''
as $$
  with files as (
    select
      r.user_id,
      r.hi_va_anar,
      row_number() over (
        partition by r.user_id
        order by r.starts_at desc, r.event_id desc
      ) as recent
    from private.streak_rows_for(p_users) r
    where (p_from is null or r.starts_at >= p_from)
      and (p_to is null or r.starts_at < p_to)
  )
  select
    user_id,
    (count(*) filter (where hi_va_anar))::int,
    count(*)::int
  from files
  group by user_id
  having count(*) >= 4
    and not bool_or(hi_va_anar) filter (where recent <= 2)
    and coalesce(
      avg(case when hi_va_anar then 1.0 else 0.0 end) filter (where recent > 2),
      0) >= 0.5
$$;

alter function private.drifting_among(uuid[], timestamptz, timestamptz) owner to postgres;
revoke all on function private.drifting_among(uuid[], timestamptz, timestamptz)
  from public, anon, authenticated;

comment on function private.drifting_among(uuid[], timestamptz, timestamptz) is
  'Dels socis de la llista, els que venien a la meitat o més i fan dues '
  'activitats comptables seguides que no vénen, amb quantes n''hi havia i a '
  'quantes van anar. Sobre private.streak_rows_for(), com drifting().';

create or replace function private.drifting(p_user uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.drifting_among(array[p_user], p_from, p_to)
  )
$$;

alter function private.drifting(uuid, timestamptz, timestamptz) owner to postgres;
revoke all on function private.drifting(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

comment on function private.drifting(uuid, timestamptz, timestamptz) is
  'Venia a la meitat o més i fa dues activitats comptables seguides que no ve. '
  'És private.drifting_among() amb un sol soci (migració 92), i per tant surt '
  'de private.streak_rows_for(), com la ratxa del perfil: tenir-ne una segona '
  'definició seria que el tauler i el perfil diguessin coses diferents del '
  'mateix soci.';

comment on function private.checkin_open_at(uuid) is
  'La finestra de fitxar d''un esdeveniment. private.streak_rows_for() en '
  'repeteix l''expressió en línia per no cridar-la per cada activitat i cada '
  'soci (migració 92): si aquesta canvia, aquella també, i la prova 497 ho '
  'vigila.';

-- ── el tauler ───────────────────────────────────────────────────────────────
-- El cos de la 82 sencer, tret dels despenjats i dels actius de cada escola.
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
  --
  -- L'id desempata (migració 92): dues persones que van venir per última vegada
  -- a la mateixa festa sortien en un ordre qualsevol, i la llista canviava
  -- d'ordre d'una càrrega a la següent sense que hagués passat res.
  select coalesce(jsonb_agg(x order by x.ultima_at desc nulls last, x.id), '[]'::jsonb)
    into v_despenjats
  from (
    select
      p.id,
      p.nombre as nom,
      p.escola,
      p.curs,
      c.telefon,
      d.hi_va_anar,
      d.comptaven,
      (select t.titulo from public.attendances a
        join public.events e on e.id = a.event_id
        left join public.event_title t on t.event_id = e.id
        where a.user_id = p.id and a.estado = 'asistio'
        order by e.starts_at desc limit 1) as ultima,
      (select e.starts_at from public.attendances a
        join public.events e on e.id = a.event_id
        where a.user_id = p.id and a.estado = 'asistio'
        order by e.starts_at desc limit 1) as ultima_at
    -- Tots els socis actius en una crida, i no un `drifting(p.id, …)` per fila:
    -- és el mateix càlcul, però una consulta en comptes de tres-centes.
    -- Migració 92.
    from private.drifting_among(
      array(select q.id from public.profiles q where q.estat = 'actiu'),
      p_from, p_to) d
    join public.profiles p on p.id = d.user_id
    left join public.profile_contact c on c.id = p.id
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
      -- `in` i no `exists` correlacionat (migració 92): la llista de qui ha
      -- vingut aquest mes no depèn del soci, o sigui que es fa una vegada i es
      -- consulta com a taula de hash, en comptes de buscar-la soci per soci.
      -- Dona els mateixos números; `attendances.user_id` no és mai NULL.
      count(*) filter (where p.id in (
        select a.user_id from public.attendances a
        join public.events e on e.id = a.event_id
        where a.estado = 'asistio'
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

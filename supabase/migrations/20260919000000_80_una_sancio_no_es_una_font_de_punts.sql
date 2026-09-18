-- El tauler llegeix el llibre major sencer, i una sanció deixa de comptar com
-- una font de punts.
--
-- EL FORAT. `admin_dashboard` munta `punts_per_motiu` amb un `where
-- l.puntos > 0` que ve de la migració 48. Quan es va escriure cap motiu no
-- podia ser negatiu i el filtre no treia res. La 73 va afegir `avis` (negatiu)
-- i `avis_retirat` (positiu, que el desfà), i des d'aleshores el filtre fa dues
-- coses alhora i totes dues malament:
--
--   · amaga senceres les files negatives —els `avis` i els ajustos a mà que
--     resten—, o sigui que el motiu `avis` no surt al panell ni existint;
--   · i deixa passar el seu `avis_retirat`, que és la RETIRADA d'un càstig,
--     sumada com si fos una font de punts guanyats.
--
-- Un avís posat i retirat suma zero al soci —el perfil ho fa bé— i al panell
-- sumava +25. El panell i el perfil explicaven dos cursos diferents.
--
-- TREURE EL FILTRE NO BASTA, i és la part que costa de veure. Amb el `where`
-- fora, `avis` surt amb el seu signe —bé— i `avis_retirat` surt com una fila
-- pròpia de +25 —malament—: el segon símptoma queda intacte, només que ara amb
-- la seva parella al costat. Per això aquí les dues files es pleguen en una:
-- `avis_retirat` s'agrupa sota `avis` i el que surt és el NET dels avisos del
-- període. Un avís posat i retirat surt com a 0 —hi és, i no ha costat res— i
-- un avís que es manté surt com a −25.
--
-- L'OPCIÓ DESCARTADA: deixar les dues files separades, com al perfil. Al perfil
-- hi són a posta —la 73 ho escriu: «les dues línies es veuen al perfil»—
-- perquè allà la pregunta és què va passar i quan. Aquí la pregunta és d'on
-- surten els punts del curs, i separades costen dues mentides alhora: una fila
-- «Avís retirat +25» que no és cap punt que hagi guanyat ningú, i una fila
-- «Avís −25» d'un càstig que ja no existeix. Hauria costat també que la suma
-- del que es dibuixa no fos mai el total del llibre major, que és justament el
-- desacord que aquesta migració tanca.
--
-- `VEGADES` COMPTA AVISOS, NO FILES. Amb les dues menes de fila plegades, un
-- `count(*)` pelat diria 2 per un sol avís retirat. El filtre del `count` fa
-- que el número segueixi sent «quants avisos s'han posat», que és l'única
-- lectura que en pot fer ningú.
--
-- ELS AJUSTOS A MÀ NO ES PLEGUEN AMB RES, i tampoc calia. `manual` sempre ha
-- estat un sol motiu que suma i resta dins seu; el que canvia és que ara la
-- seva resta es veu. La migració 72 li va posar nota obligatòria justament
-- perquè cada fila s'expliqui, i amagar-ne la meitat al panell contradeia
-- aquella feina.
--
-- LA SIGNATURA NO ES TOCA. Un paràmetre nou amb valor per defecte crearia una
-- sobrecàrrega i PostgREST contestaria PGRST203.
--
-- EL COS ÉS EL DE LA 48 SENCER, copiat i comparat línia per línia amb el que
-- la base té avui (`pg_get_functiondef`). Postgres no sap editar el cos d'una
-- funció, i un `create or replace` escrit sobre una versió vella hi hauria
-- passat l'aigua per sobre sense dir-ho —la corba d'assistència que deixa fora
-- les reunions de junta és de la 48 mateixa—. És el perill que la 71 i la 76
-- descriuen per a `award_points`. Dels cinc blocs, només `v_motius` canvia.
--
-- ELS `revoke`/`grant` ES TORNEN A ESCRIURE. Un `create or replace` sobre una
-- funció que ja existeix en conserva els permisos, o sigui que avui són
-- redundants; el dia que aquest fitxer s'apliqui sobre una base on la funció no
-- hi sigui, el `create` donaria l'EXECUTE a PUBLIC i `anon` podria mirar el
-- tauler. `010_structure.test.sql` comprova que `anon` no pugui executar res
-- que no sigui `invite_preview`, i val més la redundància de tres línies.

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
  -- SENSE FILTRE DE SIGNE: la suma per motiu ja és un `sum()`, i el total
  -- d'aquesta llista ha de ser el del llibre major i no la meitat bona. Un
  -- motiu que resta és informació —un avís que es manté, un ajust a mà que
  -- baixa— i surt amb el seu signe.
  --
  -- `avis_retirat` NO ÉS UN MOTIU D'AQUESTA LLISTA: s'agrupa sota `avis`, que
  -- és el que ell desfà. Separats, la retirada d'un càstig quedaria dibuixada
  -- com una font de punts guanyats i el càstig com si encara existís. Junts,
  -- la fila `avis` és el net del període, que és el mateix número que el soci
  -- veu al seu perfil.
  select coalesce(jsonb_agg(x order by x.punts desc), '[]'::jsonb) into v_motius
  from (
    select
      case when l.motivo = 'avis_retirat' then 'avis' else l.motivo end as motivo,
      sum(l.puntos)::int as punts,
      -- Quants avisos, no quantes files: un avís retirat en són dues.
      count(*) filter (where l.motivo <> 'avis_retirat')::int as vegades
    from public.points_log l
    where (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
    group by case when l.motivo = 'avis_retirat' then 'avis' else l.motivo end
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

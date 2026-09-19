-- L'avís i la seva retirada són la mateixa cosa, i el panell els ha de veure
-- junts encara que caiguin en dos cursos.
--
-- EL FORAT QUE QUEDA OBERT DESPRÉS DE LA 80. La 80 va plegar `avis_retirat`
-- sota `avis` perquè una retirada no es dibuixés com una font de punts. Tanca
-- el cas on les dues files cauen dins de la MATEIXA finestra: allà es
-- neutralitzen i la fila surt a zero. No en tanca cap altre, i n'hi ha un que
-- passa sovint.
--
-- `retira_avis()` escriu la compensatòria amb `now()`, una fila d'`avisos` no
-- caduca mai i el botó «Retira l'avís» surt a totes les files vives de la
-- fitxa. La 78 ja ho va haver de mirar de cara i ho classifica ella mateixa:
-- retirar un avís d'un curs anterior és «una acció normal, no un cas rar».
-- Quan la junta mira el curs on hi ha la RETIRADA i no l'avís, el grup `avis`
-- del període conté només la fila positiva, surt +25 i torna a ser exactament
-- el que la 80 volia impedir: la retirada d'un càstig competint amb muntatge i
-- amb venir al gràfic de d'on surten els punts.
--
-- I la fila es contradiu ella mateixa dins seu. El `count` de la 80 filtra
-- `motivo <> 'avis_retirat'` perquè el número segueixi sent «quants avisos
-- s'han posat»; en aquesta finestra no se n'ha posat cap. La fila deia alhora
-- «els avisos han donat +25 punts» i «no hi ha hagut cap avís».
--
-- AGRUPAR PER MOTIU NO HO POT VEURE. El que fa que un avís i la seva retirada
-- es cancel·lin no és el motiu, és la PARELLA, i la parella la guarda `avisos`
-- (`points_log_id` i `retirat_points_log_id`). Agrupar per motiu i tallar per
-- data de fila són dues decisions independents, i cap de les dues no arriba a
-- la parella.
--
-- ── LA CORRECCIÓ, QUE SÓN DUES COSES ────────────────────────────────────────
--
-- 1. LA DATA QUE MANA ÉS LA DE L'AVÍS. Les dues files —la resta i la seva
--    compensatòria— s'ancoren al `created_at` de l'avís que les explica, que és
--    literalment la regla que la 78 va escriure per al sostre del curs. Les
--    dues cauen sempre a la mateixa finestra, i per tant sempre es
--    neutralitzen: un avís d'aquest curs que es retira l'any que ve surt com a
--    0 aquí i no surt allà. Sense això, el −25 es quedava per sempre al seu
--    curs encara que ja s'hagués tornat, que és la mateixa mentida amb el signe
--    canviat.
--
--    Val la pena dir en veu alta que les dues lectures d'avisos que hi ha al
--    repositori —el sostre de la 78 i aquest panell— ara compten igual. Quan
--    dues pantalles compten el mateix de dues maneres, la junta acaba trobant
--    la diferència i no sabent quina creure.
--
-- 2. EL GRUP `avis` NO POT SER POSITIU, MAI. És un `least(..., 0)` i és el
--    fons de sac: l'ancoratge cau al `created_at` de la pròpia fila quan no hi
--    ha cap avís que hi apunti —una òrfena, que cap camí de l'aplicació no pot
--    escriure però una migració o una mà a la consola sí, i la 78 arriba a la
--    mateixa conclusió per al sostre—, i una òrfena positiva tornaria a ser una
--    barra al gràfic. Amb el `least`, «retirar un càstig no és guanyar punts»
--    passa a ser una propietat de la funció i no de les dades.
--
--    EL QUE COSTA, dit sense amagar-ho: amb una òrfena positiva dins de la
--    finestra, la suma d'aquesta llista ja no és la del llibre major d'aquell
--    període, que és justament la propietat que la 80 defensava. Es paga a
--    posta. Una fila de +25 sense cap avís al darrere no és un punt que hagi
--    guanyat ningú, i dibuixar-la com si ho fos és pitjor que no quadrar amb un
--    cas que només pot existir si algú ha escrit al llibre a mà.
--
-- 3. I LA FILA BUIDA SE'N VA. Amb el `least`, una finestra que només conté
--    òrfenes positives deixava un `{avis, 0 punts, 0 vegades}`: una fila que diu
--    que no ha passat res. Les files dels altres motius tenen sempre
--    `vegades >= 1` per construcció —`count(*)` d'un grup que existeix—, o
--    sigui que aquesta condició no en pot treure cap altra.
--
-- L'OPCIÓ DESCARTADA: arreglar-ho a `retira_avis()`, escrivint la
-- compensatòria amb la data de l'avís original. És una línia i tanca el mateix.
-- Ja es va descartar a la 78 i pel mateix motiu, que aquí encara pesa més: el
-- llibre major es llegeix com una cronologia —el perfil el pinta per data— i
-- una devolució d'avui apareixeria enmig de l'octubre passat. La retirada VA
-- PASSAR avui i la seva fila ho ha de dir; el que no ha de fer és decidir de
-- quin curs són els punts, i això es decideix aquí, on es compten.
--
-- LA MEITAT DE CLIENT. `DashboardScreen.tsx` partia la llista NOMÉS pel signe,
-- o sigui que qualsevol fila positiva era una barra del gràfic, vingués del
-- motiu que vingués. Ara la partició viu a `dashboardPoints.ts` amb la seva
-- prova i els motius d'avís no són mai una font, tingui el número el signe que
-- tingui. Les dues meitats es tapen soles: aquesta perquè el número sigui cert,
-- aquella perquè una versió antiga de la base —o aquest fitxer desfet— no
-- pugui tornar a pintar una sanció com una font.
--
-- EL QUE NO ES TOCA. Cap firma —un paràmetre nou amb valor per defecte crearia
-- una SOBRECÀRREGA i PostgREST contestaria PGRST203—, cap fila —`points_log` és
-- append-only per disparador— i cap dels altres quatre blocs. El cos és el de
-- la 80 sencer, i és sencer per la mateixa raó que el seu ho era: Postgres no
-- sap editar el cos d'una funció, i un `create or replace` escrit sobre una
-- versió vella hi passaria l'aigua per sobre sense dir-ho.
--
-- ELS `revoke`/`grant` ES TORNEN A ESCRIURE, pel motiu que la 80 explica: el
-- dia que això s'apliqui sobre una base on la funció no hi sigui, el `create`
-- donaria l'EXECUTE a PUBLIC i `anon` podria mirar el tauler.

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

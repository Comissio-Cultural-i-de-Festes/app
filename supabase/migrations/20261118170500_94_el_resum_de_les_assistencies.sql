-- El resum de les assistències d'uns quants esdeveniments: el que l'Inici i la
-- fitxa pinten, i res més.
--
-- PER QUÈ. Per dir «hi van 23», tres cares i «Ets dins», l'Inici baixava totes
-- les files d'`attendances` dels set esdeveniments que ensenya, cadascuna amb
-- el nom i la cara de la persona incrustats: amb tres-cents socis, unes
-- sis-centes files a cada obertura de l'app. Aquí es compten al servidor i en
-- surt una fila per esdeveniment.
--
-- ═══ SECURITY INVOKER, A POSTA ═══════════════════════════════════════════
--
-- La regla és «el mateix que veuria el client amb la RLS d'avui», i la manera
-- de no haver-la de copiar és no saltar-se-la. La funció corre com qui truca:
-- llegeix `attendances` i `profiles` amb les mateixes polítiques que la
-- consulta que substitueix —`att_select_self`, `att_select_public_si`,
-- `att_select_admin`, `profiles_select_directory`…— i per tant:
--
--   · un soci actiu compta els sí i els fitxats de tothom, i veu les seves
--     pròpies respostes, siguin quines siguin;
--   · la junta ho compta tot, també les reunions de junta;
--   · un pendent o una baixa només es veu a si mateix: cap cara ni cap
--     recompte dels altres, perquè cap fila dels altres li arriba;
--   · una cara la porta qui té el perfil visible; la d'algú donat de baixa
--     surt sense foto, com sortia amb l'`embed`.
--
-- Una `definer` amb la comprovació de rol al principi hauria estat la còpia de
-- les polítiques en un altre lloc, i el dia que una política canviés el resum
-- deixaria de dir el mateix que la taula sense que res fallés. Totes les
-- columnes que llegeix ja són al `grant` d'`authenticated`, o sigui que no li
-- cal cap privilegi que qui truca no tingui. `search_path` buit igualment: no
-- és obligatori en una `invoker`, però no costa res.
--
-- És `plpgsql` només per poder refusar una llista massa llarga (més avall).
--
-- ═══ QUÈ TORNA ═══════════════════════════════════════════════════════════
--
-- Una fila per cada id demanat, també quan no hi ha cap resposta: «zero» és
-- una dada, i la pantalla no ha de distingir «no n'hi ha» de «no ha vingut».
--
--   going         sí + fitxats: el número de «hi van» i el que resta de les
--                 places.
--   attended      només els fitxats: «hi van ser» i «qui hi ha dins».
--   mine          la meva resposta, o null; `mine_at` quan la vaig crear,
--                 perquè la pantalla pugui posar la meva cara al lloc on la
--                 posarà el servidor quan dic que sí abans que contesti.
--   faces         les cinc últimes persones que hi van (la fitxa n'ensenya
--                 cinc, l'Inici tres), amb `created_at` per la mateixa raó.
--   recent_total  quanta gent hi va i ha contestat des de `p_desde`, sense mi.
--   recent        els dos noms més nous d'aquests: «S'hi han apuntat avui:
--                 Marc, Júlia i 3 més» no en diu cap altre.
--
-- `p_desde` és l'inici de l'«avui» de qui pregunta. La zona de l'associació
-- és configuració del client (`VITE_TIME_ZONE`), i és el client qui sap on
-- comença el dia; el servidor només compta d'aquí endavant.
--
-- NOMÉS DOS NOMS, I NO TOTS. La primera versió tornava tots els noms de les
-- últimes 26 hores perquè el client fes el tall: l'endemà d'anunciar una festa
-- grossa eren 245 noms i 48 KB per dir-ne dos i un número.
--
-- Ni correus, ni telèfons, ni l'escola: el que pintava l'`embed` i prou.
--
-- ═══ UNA SOLA LECTURA PER ESDEVENIMENT ═══════════════════════════════════
--
-- Les files de cada esdeveniment es llegeixen una vegada, amb el perfil al
-- costat, i d'allà surten els recomptes, les cares i els noms. Les dues
-- numeracions (`cara`, `nou`) fan de `limit` dins de cada esdeveniment: la de
-- les cares només entre qui hi va, la dels noms només entre els que compten
-- com a moviment, cadascuna amb l'ordre de la pantalla.
--
-- ═══ CINQUANTA ESDEVENIMENTS COM A MOLT ══════════════════════════════════
--
-- L'Inici en demana set i la fitxa un. Una llista sense sostre és una consulta
-- que qualsevol soci pot fer tan grossa com vulgui; més de cinquanta és un
-- error de qui crida, i es diu (22023) en lloc de servir-ho.

create or replace function public.resum_assistencies(
  p_event_ids uuid[],
  p_desde     timestamptz
)
returns table (
  event_id      uuid,
  going         int,
  attended      int,
  mine          text,
  mine_at       timestamptz,
  faces         jsonb,
  recent_total  int,
  recent        text[]
)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if cardinality(p_event_ids) > 50 then
    raise exception 'massa esdeveniments: % (com a molt 50)', cardinality(p_event_ids)
      using errcode = '22023';
  end if;

  return query
  with ids as (
    select distinct unnest(p_event_ids) as event_id
  ),
  files as (
    select a.event_id,
           a.user_id,
           a.estado,
           a.created_at,
           p.nombre,
           p.avatar_url,
           a.user_id = (select auth.uid()) as meva,
           a.estado in ('si', 'asistio') as hi_va,
           a.estado in ('si', 'asistio')
             and a.user_id is distinct from (select auth.uid())
             and a.created_at >= p_desde
             and coalesce(p.nombre, '') <> '' as es_nou
      from public.attendances a
      left join public.profiles p on p.id = a.user_id
     where a.event_id = any (p_event_ids)
  ),
  numerades as (
    select f.*,
           row_number() over (
             partition by f.event_id, f.hi_va
             order by f.created_at desc, f.user_id
           ) as cara,
           row_number() over (
             partition by f.event_id, f.es_nou
             order by f.created_at desc, f.user_id
           ) as nou
      from files f
  )
  select ids.event_id,
         (count(n.user_id) filter (where n.hi_va))::int,
         (count(n.user_id) filter (where n.estado = 'asistio'))::int,
         (array_agg(n.estado) filter (where n.meva))[1],
         (array_agg(n.created_at) filter (where n.meva))[1],
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'user_id', n.user_id,
               'avatar_url', n.avatar_url,
               'created_at', n.created_at
             )
             order by n.created_at desc, n.user_id
           ) filter (where n.hi_va and n.cara <= 5),
           '[]'::jsonb
         ),
         (count(n.user_id) filter (where n.es_nou))::int,
         coalesce(
           array_agg(n.nombre order by n.created_at desc, n.user_id)
             filter (where n.es_nou and n.nou <= 2),
           '{}'::text[]
         )
    from ids
    left join numerades n on n.event_id = ids.event_id
   group by ids.event_id;
end $fn$;

revoke all on function public.resum_assistencies(uuid[], timestamptz) from public, anon;
grant execute on function public.resum_assistencies(uuid[], timestamptz)
  to authenticated, service_role;

comment on function public.resum_assistencies(uuid[], timestamptz) is
  'Per esdeveniment: quants hi van, quants hi han fitxat, la meva resposta, les '
  'cinc últimes cares i quanta gent hi ha dit que sí des de p_desde, amb els dos '
  'noms més nous. Com a molt 50 esdeveniments. SECURITY INVOKER: les polítiques '
  'd''attendances i profiles decideixen què es compta, exactament com quan el '
  'client llegia les files.';

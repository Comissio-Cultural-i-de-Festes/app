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
-- ═══ QUÈ TORNA ═══════════════════════════════════════════════════════════
--
-- Una fila per cada id demanat, també quan no hi ha cap resposta: «zero» és
-- una dada, i la pantalla no ha de distingir «no n'hi ha» de «no ha vingut».
--
--   going     sí + fitxats: el número de «hi van» i el que resta de les places.
--   attended  només els fitxats: «hi van ser» i «qui hi ha dins».
--   mine      la meva resposta, o null; `mine_at` quan la vaig crear, perquè
--             la pantalla pugui posar la meva cara al lloc on la posarà el
--             servidor quan dic que sí abans que contesti.
--   faces     les cinc últimes persones que hi van (la fitxa n'ensenya cinc,
--             l'Inici tres), amb `created_at` per la mateixa raó.
--   recent    nom i hora de qui hi va i ha contestat les últimes 26 hores,
--             sense mi. «Avui» és un dia de la zona de l'associació, i la zona
--             és configuració del client (`VITE_TIME_ZONE`): el servidor dona
--             una finestra que cobreix qualsevol «avui», també el de 25 hores
--             del canvi d'hora, i el client hi fa el tall com abans.
--
-- Ni correus, ni telèfons, ni l'escola: el que pintava l'`embed` i prou.

create or replace function public.resum_assistencies(p_event_ids uuid[])
returns table (
  event_id  uuid,
  going     int,
  attended  int,
  mine      text,
  mine_at   timestamptz,
  faces     jsonb,
  recent    jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ids.event_id,
         coalesce(n.going, 0),
         coalesce(n.attended, 0),
         m.estado,
         m.created_at,
         coalesce(f.faces, '[]'::jsonb),
         coalesce(r.recent, '[]'::jsonb)
    from (select distinct unnest(p_event_ids) as event_id) ids
    left join lateral (
      select count(*) filter (where a.estado in ('si', 'asistio'))::int as going,
             count(*) filter (where a.estado = 'asistio')::int as attended
        from public.attendances a
       where a.event_id = ids.event_id
    ) n on true
    left join lateral (
      select a.estado, a.created_at
        from public.attendances a
       where a.event_id = ids.event_id
         and a.user_id = (select auth.uid())
    ) m on true
    left join lateral (
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', x.user_id,
                 'avatar_url', x.avatar_url,
                 'created_at', x.created_at
               )
               order by x.created_at desc, x.user_id
             ) as faces
        from (
          select a.user_id, a.created_at, p.avatar_url
            from public.attendances a
            left join public.profiles p on p.id = a.user_id
           where a.event_id = ids.event_id
             and a.estado in ('si', 'asistio')
           order by a.created_at desc, a.user_id
           limit 5
        ) x
    ) f on true
    left join lateral (
      select jsonb_agg(
               jsonb_build_object('nombre', p.nombre, 'created_at', a.created_at)
               order by a.created_at desc, a.user_id
             ) as recent
        from public.attendances a
        join public.profiles p on p.id = a.user_id
       where a.event_id = ids.event_id
         and a.estado in ('si', 'asistio')
         and a.user_id is distinct from (select auth.uid())
         and a.created_at >= now() - interval '26 hours'
         and p.nombre <> ''
    ) r on true
$$;

revoke all on function public.resum_assistencies(uuid[]) from public, anon;
grant execute on function public.resum_assistencies(uuid[]) to authenticated, service_role;

comment on function public.resum_assistencies(uuid[]) is
  'Per esdeveniment: quants hi van, quants hi han fitxat, la meva resposta, les '
  'cinc últimes cares i qui hi ha dit que sí les últimes 26 hores. SECURITY '
  'INVOKER: les polítiques d''attendances i profiles decideixen què es compta, '
  'exactament com quan el client llegia les files.';

-- Les activitats que falta visar, i les quatre funcions que es van quedar
-- obertes.
--
-- EL FORAT QUE TAPA. La 67 va deixar el visat darrere d'un sol enllaç: la tira
-- del formulari de l'activitat. I al formulari d'una activitat passada no s'hi
-- arriba des de cap lloc —`fetchJuntaEvents` demana `starts_at >= ara` i a més
-- exclou les reunions, i al rebedor una reunió tancada porta a la pantalla del
-- soci, a llegir l'acta—. O sigui que la porta del visat només existia per a
-- activitats FUTURES I QUE NO SÓN REUNIONS, que és exactament el conjunt
-- contrari al que es visa. Es va veure el primer dia que algú ho va voler fer.
--
-- Amb una llista, `/junta/hores` passa a tenir el camí complet: el número de la
-- feina, quines activitats són, i l'enllaç a cadascuna.
--
-- PER QUÈ AMPLIAR LA RPC QUE JA HI HA i no fer-ne una de nova. La pregunta és
-- la mateixa —què queda per visar— i partir-la en dues voldria dir dues
-- consultes que poden respondre coses diferents el dia que la condició canviï.
-- El rebedor només en llegeix el recompte i no li fa cap mal rebre cinc files
-- de més: són les activitats que la junta encara no ha mirat, no un catàleg.
--
-- I LES QUATRE FUNCIONS DE `private` de la 67, que es van quedar amb l'EXECUTE
-- per defecte a PUBLIC. No era explotable —`anon` no té USAGE sobre el schema i
-- PostgREST no l'exposa— però `private.periode_curs()` és `security definer`, i
-- en aquest repo un definer amb grant a PUBLIC no es deixa al defecte: les
-- seves veïnes porten el revoke escrit des de la 37 i la 48. Les quatre només
-- les criden funcions definer, que corren com el propietari, així que el revoke
-- pot ser sencer.

create or replace function public.admin_hores_pendents()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_des_de timestamptz;
  v_fins_a timestamptz;
  v_files  jsonb;
  v_acts   int;
  v_minuts int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

  with pendents as (
    select e.id, e.starts_at, e.minuts_memoria, t.titulo
      from public.events e
      left join public.event_title t on t.event_id = e.id
     where e.a_la_uni
       and e.hores_verificat_at is null
       and e.starts_at < now()
       and (v_des_de is null or e.starts_at >= v_des_de)
       and (v_fins_a is null or e.starts_at <  v_fins_a)
  ),
  amb_gent as (
    select p.id, p.starts_at, p.titulo,
           count(a.user_id)::int as persones,
           coalesce(sum(
             private.minuts_persona(
               p.starts_at, p.minuts_memoria,
               a.checked_in_at, a.exit_photo_at, a.minuts_memoria
             )
           ), 0)::int as minuts
      from pendents p
      left join public.attendances a
        on a.event_id = p.id
       and a.estado = 'asistio'
     group by p.id, p.starts_at, p.titulo
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'event_id',  g.id,
               'titol',     g.titulo,
               'starts_at', g.starts_at,
               'persones',  g.persones,
               'minuts',    g.minuts
             )
             -- La més antiga a dalt: la que fa més dies que espera és la que
             -- costa més de recordar, i per tant la que s'ha de mirar primer.
             order by g.starts_at
           ),
           '[]'::jsonb
         ),
         count(*)::int,
         coalesce(sum(g.minuts), 0)::int
    into v_files, v_acts, v_minuts
    from amb_gent g;

  return jsonb_build_object('activitats', v_acts, 'minuts', v_minuts, 'files', v_files);
end $fn$;

comment on function public.admin_hores_pendents() is
  'Quines activitats d''aquest curs ja fetes encara no tenen les hores visades, '
  'quantes son i quantes hores de gent hi ha en joc. La feina que li queda a la '
  'junta abans de tancar la memoria, i el cami per anar-hi.';

alter function public.admin_hores_pendents() owner to postgres;
revoke all on function public.admin_hores_pendents() from public, anon;
grant execute on function public.admin_hores_pendents() to authenticated;

-- ── i les quatre que es van quedar obertes ──────────────────────────────────
revoke all on function private.memoria_a_la_uni_defecte(text)
  from public, anon, authenticated;
revoke all on function private.memoria_minuts(text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function private.minuts_persona(timestamptz, int, timestamptz, timestamptz, int)
  from public, anon, authenticated;
revoke all on function private.periode_curs()
  from public, anon, authenticated;

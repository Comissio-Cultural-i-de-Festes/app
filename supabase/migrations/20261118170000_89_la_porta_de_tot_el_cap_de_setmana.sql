-- La porta de tot el cap de setmana, i de més d'un esdeveniment.
--
-- EL QUE PASSAVA. `junta_home()` posava a la porta UN esdeveniment: el primer
-- que no fos reunió amb `starts_at` entre fa vuit hores i d'aquí a trenta. Dues
-- coses quedaven fora sense que ningú ho decidís:
--
--   · Una casa rural de divendres a diumenge sortia a la porta de dijous a la
--     nit fins a divendres a la matinada, i després desapareixia. Dissabte, amb
--     la gent a dins i la gimcana en marxa, el panell deia «res aquests dies».
--     Les vuit hores eren una manera de dir «la nit ja s'ha acabat» quan una
--     festa durava una nit; amb una sortida de tres dies diuen una cosa falsa.
--   · Dues activitats el mateix dia: la segona no tenia porta. El servidor no hi
--     posa cap finestra —l'escàner, l'alta i els punts funcionen per URL a
--     qualsevol esdeveniment—, o sigui que era la pantalla qui l'amagava.
--
-- QUÈ CANVIA:
--
--   · La finestra va de trenta hores abans de començar fins a la més tardana de
--     dues hores: vuit hores després de començar, o quan s'acaba. Per a una
--     festa d'una nit és exactament la d'abans, perquè s'acaba abans de les vuit
--     hores; per a una casa rural és tota l'estada.
--   · `portes` és la llista de TOTS els esdeveniments de la finestra, cadascun
--     amb els mateixos números que `porta`, en ordre d'inici. La pantalla hi
--     posa un selector quan n'hi ha més d'un.
--   · `porta` es queda, i és el primer de `portes`: el mateix que triava abans.
--     Un mòbil amb la versió d'ahir carregada continua veient la porta que veia,
--     i el dia del desplegament no hi ha cap moment en què el panell quedi buit.
--   · Cada porta porta `ends_at`, perquè la línia de sota el títol pugui dir
--     «de divendres a diumenge» i no només el dia que va començar.
--   · `propers` compta amb la mateixa vora enrere: un esdeveniment en marxa és
--     dels que venen fins que s'acaba, com a la llista de `eventsApi.ts`.
--
-- DESCARTAT: VUIT HORES DESPRÉS DEL FINAL, en comptes de la més tardana. És una
-- regla més curta d'escriure, i canviava el cas que avui funciona: la festa de
-- divendres a les 22 h, que acaba a les 4 h, hauria seguit a la porta fins al
-- migdia de dissabte, al davant de la de dissabte a la nit. Donar punts
-- l'endemà no necessita la porta: cada eina penja ara de la fitxa de
-- l'esdeveniment, a la junta.
--
-- DESCARTAT: UN PARÀMETRE `p_event_id` perquè el client demanés els números de
-- l'esdeveniment triat. Hauria estat una crida més per cada canvi al selector
-- —a la porta, amb la xarxa de la casa rural— i, amb un paràmetre amb valor per
-- defecte, una segona sobrecàrrega i el PGRST203 de PostgREST. A la finestra
-- n'hi ha un o dos; tornar-los tots costa una fila més i deixa canviar d'un a
-- l'altre sense xarxa.

create or replace function public.junta_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_portes  jsonb;
  v_pendents int;
  v_esborranys int;
  v_propers int;
  v_socis int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(p.porta order by p.starts_at, p.id), '[]'::jsonb)
  into v_portes
  from (
    select
      e.id,
      e.starts_at,
      jsonb_build_object(
        'id', e.id,
        'titulo', t.titulo,
        'starts_at', e.starts_at,
        'ends_at', d.ends_at,
        'ubicacion', d.ubicacion,
        'plazas', e.plazas,
        'de_pagament', e.precio_cents > 0,
        -- Said yes and already through the door are the same set the member
        -- screens count, so the number here and the number there agree.
        'diuen_si', count(*) filter (where a.estado in ('si', 'asistio')),
        'fitxats', count(*) filter (where a.checked_in_at is not null),
        -- Waiting and asked are one number on this screen: from here they are
        -- the same job, which is somebody deciding.
        'esperen', count(*) filter (where a.estado in ('espera', 'sollicitat')),
        -- SENSE PREU NO HI HA DEUTE (migració 69).
        'no_pagats', count(*) filter (
          where e.precio_cents > 0
            and a.estado in ('si', 'asistio') and not a.pagado
        ),
        -- NULL si no hi ha gimcana; el nombre de fotos esperant si n'hi ha.
        'gimcana_cua', (
          select (select count(*)
                    from public.gimcana_enviaments s
                    join public.gimcana_proves pr on pr.id = s.prova_id
                   where pr.gimcana_id = g.id
                     and s.estat = 'pendent')
            from public.gimcanes g
           where g.event_id = e.id
        )
      ) as porta
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.event_details d on d.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.published
      -- UNA REUNIÓ NO ÉS LA PORTA. Aquest bloc parla d'una cua, d'un QR i de
      -- qui no ha pagat, i una reunió no té cap de les tres coses.
      and e.tipo <> 'reunio'
      and e.starts_at <= now() + interval '30 hours'
      -- `greatest` no fa cas d'un NULL: sense hora de final —esdeveniments
      -- d'abans de la 67— queda la regla de sempre, vuit hores des de l'inici.
      and greatest(e.starts_at + interval '8 hours', d.ends_at) >= now()
    group by e.id, t.titulo, d.ubicacion, d.ends_at
  ) p;

  select count(*) into v_pendents from public.profiles where estat = 'pendent';
  select count(*) into v_esborranys from public.events where not published;
  select count(*) into v_propers
    from public.events e
    left join public.event_details d on d.event_id = e.id
    -- I les reunions tampoc es compten aquí: tenen el seu bloc al panell, i
    -- sortir a tots dos llocs faria que el nombre no quadrés amb cap llista.
    where e.tipo <> 'reunio'
      and greatest(e.starts_at + interval '8 hours', d.ends_at) >= now();
  select count(*) into v_socis from public.profiles where estat = 'actiu';

  return jsonb_build_object(
    -- `-> 0` d'una llista buida és NULL, i a la resposta queda `null`: el
    -- mateix «no hi ha porta» d'abans, sense cap cas a part.
    'porta', v_portes -> 0,
    'portes', v_portes,
    'pendents', v_pendents,
    'esborranys', v_esborranys,
    'propers', v_propers,
    'socis', v_socis
  );
end $$;

-- `create or replace` torna a donar EXECUTE a PUBLIC. Sense aquestes dues
-- línies, `010_structure.test.sql` falla: l'única funció que `anon` pot
-- executar en aquest esquema és `invite_preview`.
revoke all on function public.junta_home() from public, anon;
grant execute on function public.junta_home() to authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/89_la_porta_de_tot_el_cap_de_setmana.sql: el cos de la
-- 69 tal com era.

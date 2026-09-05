-- La cua de la gimcana també és feina, i el panell de la junta no la comptava.
--
-- `junta_home` retorna les quatre coses que hi ha per fer —qui espera entrar,
-- qui no ha pagat, els esborranys i la cua de la porta— i la pantalla les suma
-- a «hi ha feina, N coses». Les fotos de la gimcana esperant validació no hi
-- eren, i és la que més corre de totes: la pantalla d'enviar-la li promet al
-- soci que «la mira algú de la junta aquesta mateixa nit», i els punts de
-- l'equip no es mouen fins que algú ho fa.
--
-- `gimcana_cua` va DINS de `porta` perquè és d'aquell esdeveniment i no de
-- l'associació, com `fitxats` o `no_pagats`.
--
-- I VAL NULL QUAN NO HI HA GIMCANA, que no és el mateix que zero. Zero vol dir
-- «n'hi ha una i està al dia», i llavors el botó ha de sortir igual: durant una
-- festa la cua s'omple i es buida cada pocs minuts, i si el camí desapareix
-- quan està buida, desapareix justament quan algú hi va a mirar. Sense
-- gimcana, no hi ha res a mirar i el botó no hi és.
--
-- La subconsulta és escalar i no un join: `gimcanes.event_id` és UNIQUE, així
-- que torna una fila o cap. Un join multiplicaria els `count(*) filter` de sobre,
-- que compten assistències.

create or replace function public.junta_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event   public.events%rowtype;
  v_porta   jsonb := null;
  v_pendents int;
  v_esborranys int;
  v_propers int;
  v_socis int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event
  from public.events
  where published
    -- UNA REUNIÓ NO ÉS LA PORTA. Aquest bloc parla d'una cua, d'un QR i de qui
    -- no ha pagat, i una reunió no té cap de les tres coses. Sense això, una
    -- junta convocada per aquesta nit desplaçaria la festa de demà del lloc on
    -- la junta hi va a treballar.
    and tipo <> 'reunio'
    and starts_at between now() - interval '8 hours' and now() + interval '30 hours'
  order by starts_at
  limit 1;

  if found then
    select jsonb_build_object(
      'id', v_event.id,
      'titulo', t.titulo,
      'starts_at', v_event.starts_at,
      'ubicacion', d.ubicacion,
      'plazas', v_event.plazas,
      'de_pagament', v_event.precio_cents > 0,
      -- Said yes and already through the door are the same set the member
      -- screens count, so the number here and the number there agree.
      'diuen_si', count(*) filter (where a.estado in ('si', 'asistio')),
      'fitxats', count(*) filter (where a.checked_in_at is not null),
      -- Waiting and asked are one number on this screen: from here they are
      -- the same job, which is somebody deciding.
      'esperen', count(*) filter (where a.estado in ('espera', 'sollicitat')),
      'no_pagats', count(*) filter (where a.estado in ('si', 'asistio') and not a.pagado),
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
    )
    into v_porta
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.event_details d on d.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.id = v_event.id
    group by e.id, t.titulo, d.ubicacion;
  end if;

  select count(*) into v_pendents from public.profiles where estat = 'pendent';
  select count(*) into v_esborranys from public.events where not published;
  select count(*) into v_propers
    from public.events
    -- I les reunions tampoc es compten aquí: tenen el seu bloc al panell, i
    -- sortir a tots dos llocs faria que el nombre no quadrés amb cap llista.
    where tipo <> 'reunio' and starts_at >= now() - interval '8 hours';
  select count(*) into v_socis from public.profiles where estat = 'actiu';

  return jsonb_build_object(
    'porta', v_porta,
    'pendents', v_pendents,
    'esborranys', v_esborranys,
    'propers', v_propers,
    'socis', v_socis
  );
end $$;

revoke all on function public.junta_home() from public, anon;
grant execute on function public.junta_home() to authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/63_la_cua_de_la_gimcana_es_feina.sql: el mateix cos
-- sense la clau `gimcana_cua`. La pantalla la llegeix amb `?? null`, així que
-- desfer-ho deixa el botó fora i el comptador com estava.

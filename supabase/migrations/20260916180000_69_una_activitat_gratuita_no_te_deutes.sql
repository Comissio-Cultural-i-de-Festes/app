-- Una activitat gratuïta no té ningú que «no ha pagat».
--
-- `no_pagats` es comptava sense mirar el preu. I `attendances.pagado` arrenca a
-- `false` per a tothom, o sigui que en un esdeveniment de franc el número era,
-- literalment, tothom qui ha dit que sí: una festa sense preu sortia al panell
-- amb dotze persones a qui reclamar res.
--
-- I EL DETALL QUE HO FA PITJOR: aquesta mateixa funció ja ho sabia. La línia de
-- sobre torna `de_pagament` des de la 28 i no la llegeix ningú.
--
-- PER QUÈ LA CONDICIÓ VA AL NÚMERO I NO A LA PANTALLA. `no_pagats` el llegeixen
-- quatre superfícies del rebedor —l'avís, el subtítol «de N que han dit que
-- sí», la rodona de la fila de Pagaments i la suma de «hi ha feina, N coses»—
-- i cadascuna amb la seva pròpia guarda. Gatejar-ho al client volia dir enfilar
-- `de_pagament` a les quatre i esperar que ningú n'afegís una cinquena sense
-- recordar-se'n; el dia que passés, l'encapçalament diria «3 coses» amb dues
-- files dibuixades. Amb la condició aquí, les quatre s'arreglen soles i no hi
-- ha res a recordar.
--
-- EL QUE NO CANVIA: `attendances.pagado` es queda tal com és, i `admin_set_paid`
-- també. Una activitat pot passar de gratuïta a de pagament amb la gent ja
-- apuntada, i el que s'hagi marcat abans no s'ha de perdre. El que canvia és
-- qui ho ensenya i quan.
--
-- La resta del cos és el de la 63, sense tocar.

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
      -- SENSE PREU NO HI HA DEUTE. La condició és la primera del filtre perquè
      -- és la que decideix si la pregunta existeix; les altres dues només
      -- trien, d'entre els qui vénen, qui encara no ha passat pel Bizum.
      'no_pagats', count(*) filter (
        where v_event.precio_cents > 0
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

-- `create or replace` torna a donar EXECUTE a PUBLIC. Sense aquestes dues
-- línies, `010_structure.test.sql` falla: l'única funció que `anon` pot
-- executar en aquest esquema és `invite_preview`.
revoke all on function public.junta_home() from public, anon;
grant execute on function public.junta_home() to authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/69_una_activitat_gratuita_no_te_deutes.sql: el mateix
-- cos sense la condició del preu, que és exactament el de la 63.

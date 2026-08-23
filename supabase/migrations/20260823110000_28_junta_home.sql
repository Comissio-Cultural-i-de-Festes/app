-- Everything the junta's front door needs, in one answer.
--
-- The screen shows the event that is about to happen with three counts on it,
-- four counts of work waiting, and how many events are on the calendar. Asked
-- separately that is six round trips on a phone, on the way to a venue, on the
-- worst signal of the year — and six independent loading states on a screen
-- whose whole job is to be readable in three seconds.
--
-- One call, one spinner, and the design says exactly which parts of the screen
-- are allowed to wait: the door panel and the numbers. The navigation rows draw
-- immediately and are always tappable, because a junta member who knows where
-- they are going should never be held up by a count.

-- ── which event is "at the door" ────────────────────────────────────────────
-- The day before, and until well after it started. Both halves matter: the
-- scanner has to appear before anybody sets off, and an event that began four
-- hours ago is exactly the one somebody is still checking people into.
--
-- Numbers rather than a config row on purpose. They are not a policy anybody
-- will want to tune; they are what "tonight" means.
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
    and starts_at between now() - interval '8 hours' and now() + interval '30 hours'
  order by starts_at
  limit 1;

  if found then
    select jsonb_build_object(
      'id', v_event.id,
      'titulo', v_event.titulo,
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
      'no_pagats', count(*) filter (where a.estado in ('si', 'asistio') and not a.pagado)
    )
    into v_porta
    from public.events e
    left join public.event_details d on d.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.id = v_event.id
    group by e.id, d.ubicacion;
  end if;

  select count(*) into v_pendents from public.profiles where estat = 'pendent';
  select count(*) into v_esborranys from public.events where not published;
  select count(*) into v_propers
    from public.events where starts_at >= now() - interval '8 hours';
  select count(*) into v_socis from public.profiles where estat = 'actiu';

  return jsonb_build_object(
    'porta', v_porta,
    'pendents', v_pendents,
    'esborranys', v_esborranys,
    'propers', v_propers,
    'socis', v_socis
  );
end $$;

comment on function public.junta_home() is
  'The junta home screen in one call. DEFINER because it counts rows across '
  'profiles, events and attendances that no single policy publishes together, '
  'and it returns only counts — no names, no ids beyond the one event it '
  'names. Admin-only, checked first.';

alter function public.junta_home() owner to postgres;
revoke all on function public.junta_home() from public, anon;
grant execute on function public.junta_home() to authenticated;

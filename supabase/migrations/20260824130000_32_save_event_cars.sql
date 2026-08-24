-- The form learns the cars switch.
--
-- Third time this function is dropped and recreated, and for the third time
-- the reason is the same: a defaulted parameter added at the end is a new
-- overload rather than a new version, and PostgREST answers a call that
-- matches two of them with PGRST203 instead of picking one.
drop function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean
);

create or replace function public.admin_save_event(
  p_titulo text,
  p_tipo text,
  p_starts_at timestamptz,
  p_id uuid default null,
  p_plazas int default null,
  p_precio_cents int default 0,
  p_puntos int default null,
  p_teaser text default null,
  p_reveal_at timestamptz default null,
  p_published boolean default false,
  p_descripcion text default null,
  p_ubicacion text default null,
  p_ends_at timestamptz default null,
  p_cover_url text default null,
  p_transport_info text default null,
  p_cal_confirmacio boolean default false,
  p_te_cotxes boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_puntos  int  := p_puntos;
  v_before  jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_tipo not in ('fiesta', 'casa_rural', 'actividad') then
    raise exception 'tipus invalid' using errcode = '22023';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'cal un titol' using errcode = '22023';
  end if;

  -- Only for a new event. Changing the scale later must never restate what an
  -- evening that already happened was worth.
  if v_puntos is null then
    select punts into v_puntos
      from public.point_values
     where mena = 'tipus_esdeveniment' and clau = p_tipo;
    v_puntos := coalesce(v_puntos, 10);
  end if;

  if v_id is null then
    insert into public.events (
      titulo, tipo, starts_at, plazas, precio_cents, puntos,
      teaser, reveal_at, published, cal_confirmacio, te_cotxes, created_by
    )
    values (
      p_titulo, p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, coalesce(p_cal_confirmacio, false),
      coalesce(p_te_cotxes, false), (select auth.uid())
    )
    returning id into v_id;
  else
    select to_jsonb(e) into v_before from public.events e where e.id = v_id;
    if v_before is null then
      raise exception 'esdeveniment inexistent' using errcode = '42501';
    end if;

    update public.events set
      titulo = p_titulo, tipo = p_tipo, starts_at = p_starts_at,
      plazas = p_plazas, precio_cents = p_precio_cents, puntos = v_puntos,
      teaser = p_teaser, reveal_at = p_reveal_at, published = p_published,
      cal_confirmacio = coalesce(p_cal_confirmacio, false),
      te_cotxes = coalesce(p_te_cotxes, false)
    where id = v_id;
  end if;

  insert into public.event_details (
    event_id, descripcion, ubicacion, ends_at, cover_url, transport_info
  )
  values (v_id, p_descripcion, p_ubicacion, p_ends_at, p_cover_url, p_transport_info)
  on conflict (event_id) do update set
    descripcion    = excluded.descripcion,
    ubicacion      = excluded.ubicacion,
    ends_at        = excluded.ends_at,
    cover_url      = excluded.cover_url,
    transport_info = excluded.transport_info;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    case when p_id is null then 'create_event' else 'edit_event' end,
    v_id,
    jsonb_build_object(
      'titulo', p_titulo, 'published', p_published, 'reveal_at', p_reveal_at,
      'cal_confirmacio', coalesce(p_cal_confirmacio, false),
      'te_cotxes', coalesce(p_te_cotxes, false)
    )
  );

  return v_id;
end $$;

comment on function public.admin_save_event is
  'Creates or updates an event and its detail row in one transaction. Two '
  'round trips could leave an event whose details row never arrived, and an '
  'absent details row is indistinguishable from a reveal that has not '
  'happened — so the screen would look correct and the location would be gone.';

alter function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean
) owner to postgres;
revoke all on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean
) from public, anon;
grant execute on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean
) to authenticated;

-- Rollback de la migració 67. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu el comptador d'hores sencer: les quatre columnes d'`events`, l'excepció
-- per persona a `attendances`, les set funcions i les tres accions del registre.
--
-- EL QUE NO TORNA, i és a posta: les hores que la junta hagi visat o corregit
-- mentre això estava viu. Desfer-ho les esborra amb les columnes. Si s'ha
-- d'aplicar amb una memòria a mig fer, copieu-vos abans
-- `select id, a_la_uni, minuts_memoria, hores_verificat_at from public.events`
-- i `select user_id, event_id, minuts_memoria from public.attendances
--    where minuts_memoria is not null`.
--
-- L'ORDRE IMPORTA: primer les files del registre amb les accions noves, que si
-- no el CHECK vell les rebutja; després la vista, que referencia les columnes;
-- i les columnes al final.

-- Les línies de registre de les accions que deixaran d'existir. No es poden
-- deixar: el CHECK vell no les admet i l'`alter table` de més avall fallaria.
delete from public.audit_log
 where accio in ('set_hores', 'visa_hores', 'hores_persona');

alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'award_points',
    'check_in_here',
    'close_meeting',
    'create_event',
    'create_invite',
    'decide_attendance',
    'decide_proposal',
    'delete_event',
    'delete_grau',
    'edit_event',
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
    'set_estat',
    'set_paid',
    'set_point_value',
    'set_published',
    'set_role',
    'transfer_owner',
    'undo_checkin'
  ));

drop function if exists public.admin_set_hores_persona(uuid, uuid, int);
drop function if exists public.admin_visa_hores(uuid, boolean);
drop function if exists public.admin_set_hores(uuid, int, boolean);
drop function if exists public.admin_hores_socis();
drop function if exists public.admin_hores_esdeveniment(uuid);
drop function if exists public.my_hores();

-- `admin_save_event` tal com la va deixar la migració 48: sense exigir l'hora de
-- final i sense escriure els minuts ni la marca.
drop function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
);

create function public.admin_save_event(
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
  p_te_cotxes boolean default false,
  p_abast text default 'comi'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id      uuid := p_id;
  v_puntos  int  := p_puntos;
  v_abast   text := coalesce(p_abast, 'comi');
  v_before  jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_tipo not in ('fiesta', 'casa_rural', 'actividad', 'reunio') then
    raise exception 'tipus invalid' using errcode = '22023';
  end if;
  if v_abast not in ('comi', 'junta') then
    raise exception 'abast invalid' using errcode = '22023';
  end if;
  if v_abast = 'junta' and p_tipo <> 'reunio' then
    raise exception 'nomes una reunio pot ser d''abast junta' using errcode = '22023';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'cal un titol' using errcode = '22023';
  end if;

  if v_puntos is null then
    select punts into v_puntos
      from public.point_values
     where mena = 'tipus_esdeveniment' and clau = p_tipo;
    v_puntos := coalesce(v_puntos, 10);
  end if;

  if v_abast = 'junta' then
    v_puntos := 0;
  end if;

  if v_id is null then
    insert into public.events (
      tipo, starts_at, plazas, precio_cents, puntos,
      teaser, reveal_at, published, cal_confirmacio, te_cotxes, abast, created_by
    )
    values (
      p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, coalesce(p_cal_confirmacio, false),
      coalesce(p_te_cotxes, false), v_abast, (select auth.uid())
    )
    returning id into v_id;
  else
    select to_jsonb(e) into v_before from public.events e where e.id = v_id;
    if v_before is null then
      raise exception 'esdeveniment inexistent' using errcode = '42501';
    end if;

    update public.events set
      tipo = p_tipo, starts_at = p_starts_at,
      plazas = p_plazas, precio_cents = p_precio_cents, puntos = v_puntos,
      teaser = p_teaser, reveal_at = p_reveal_at, published = p_published,
      cal_confirmacio = coalesce(p_cal_confirmacio, false),
      te_cotxes = coalesce(p_te_cotxes, false),
      abast = v_abast
    where id = v_id;
  end if;

  insert into public.event_title (event_id, titulo)
  values (v_id, btrim(p_titulo))
  on conflict (event_id) do update set titulo = excluded.titulo;

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
      'te_cotxes', coalesce(p_te_cotxes, false),
      'tipo', p_tipo, 'abast', v_abast
    )
  );

  return v_id;
end $fn$;

alter function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) owner to postgres;
revoke all on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) from public, anon;
grant execute on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) to authenticated;

-- La vista ha de perdre les quatre columnes del final, i treure'n vol dir drop
-- i create: `create or replace view` només sap afegir-ne. El drop se'n duu els
-- grants, i per això es tornen a donar aquí sota.
drop view public.events_public;

create view public.events_public
with (security_invoker = true, security_barrier = true) as
select
  e.id,
  t.titulo,
  e.tipo,
  e.starts_at,
  e.teaser,
  e.reveal_at,
  (e.reveal_at is null or e.reveal_at <= now()) as revelat,
  e.plazas,
  e.precio_cents,
  e.puntos,
  e.published,
  e.created_by,
  e.created_at,
  d.descripcion,
  d.ubicacion,
  d.ends_at,
  d.cover_url,
  d.transport_info,
  e.cal_confirmacio,
  e.te_cotxes,
  e.abast,
  e.tancada_at,
  d.acta
from public.events e
left join public.event_title t on t.event_id = e.id
left join public.event_details d on d.event_id = e.id;

alter view public.events_public owner to postgres;
revoke all on public.events_public from anon, authenticated;
grant select on public.events_public to authenticated, service_role;

alter table public.attendances
  drop constraint attendances_minuts_memoria_check;
alter table public.attendances
  drop column minuts_memoria;

alter table public.events
  drop constraint events_casa_rural_mai_a_la_uni,
  drop constraint events_minuts_memoria_check;
alter table public.events
  drop column hores_verificat_per,
  drop column hores_verificat_at,
  drop column minuts_memoria,
  drop column a_la_uni;

drop function if exists private.periode_curs();
drop function if exists private.minuts_persona(timestamptz, int, timestamptz, timestamptz, int);
drop function if exists private.memoria_minuts(text, timestamptz, timestamptz);
drop function if exists private.memoria_a_la_uni_defecte(text);

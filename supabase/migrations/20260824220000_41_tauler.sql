-- El tauler de la junta.
--
-- CAP TAULA NOVA. Tot són consultes sobre fitxatges, punts, perfils i períodes,
-- i això no és una casualitat: la fase 3 existeix per fer tornar la gent al
-- gener, i el que fa falta per decidir-ho ja fa tres mesos que s'està desant.
--
-- UNA SOLA PREGUNTA: qui s'està despenjant i què hi fem. Cada part acaba en una
-- acció, i un número que no en canvia cap no hi hauria de ser. Per això no hi
-- ha ni un total de socis ni un compte d'activitats fetes: es poden mirar en
-- tres tocs i no fan canviar res.
--
-- ELS DESPENJATS ES CALCULEN AMB `private.streak_rows()`, que ja existeix des de
-- la migració 37. No és reaprofitar per estalviar feina: és que la definició de
-- «quines activitats comptaven per a aquesta persona» ja està escrita allà, amb
-- la llista d'espera descomptada i la data d'alta respectada, i tenir-ne una
-- segona voldria dir que algun dia el tauler i el perfil dirien coses
-- diferents de la mateixa persona.
--
-- EL QUE ENCARA NO ES POT DIR. «Qui feia anys que venia» no surt: les dades
-- comencen al setembre. El tauler llegeix el ritme dins del curs, i el d'anys
-- vindrà sol el curs que ve sense tocar res d'aquí.

-- ── qui s'està despenjant ───────────────────────────────────────────────────
-- Venia sovint i fa dues activitats comptables seguides que no ve.
--
-- Les dues condicions són necessàries i cap sobra. Sense la primera, tothom qui
-- ha vingut un cop i no ha tornat surt a la llista i la llista deixa de ser
-- útil el primer dia. Sense la segona, hi surt qui simplement encara no ha
-- tingut ocasió.
--
-- Quatre activitats de mínim: amb tres, «la meitat» i «les dues últimes» es
-- trepitgen i qualsevol soci nou hi cau.
create or replace function private.drifting(p_user uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with files as (
    select r.hi_va_anar, row_number() over (order by r.starts_at desc) as recent
    from private.streak_rows(p_user) r
    where (p_from is null or r.starts_at >= p_from)
      and (p_to is null or r.starts_at < p_to)
  )
  select
    count(*) >= 4
    and not bool_or(hi_va_anar) filter (where recent <= 2)
    and coalesce(
      avg(case when hi_va_anar then 1.0 else 0.0 end) filter (where recent > 2),
      0) >= 0.5
  from files
$$;

alter function private.drifting(uuid, timestamptz, timestamptz) owner to postgres;
revoke all on function private.drifting(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

comment on function private.drifting(uuid, timestamptz, timestamptz) is
  'Venia a la meitat o més i fa dues activitats comptables seguides que no ve. '
  'Sobre private.streak_rows(), que ja sap quines activitats comptaven per a '
  'aquesta persona: tenir-ne una segona definició seria que el tauler i el '
  'perfil diguessin coses diferents del mateix soci.';

-- ── el tauler ───────────────────────────────────────────────────────────────
-- Una crida i cinc parts, com `junta_home()`. Cinc peticions serien cinc
-- estats de càrrega i cinc coses que poden fallar en una pantalla que es mira
-- una vegada al mes.
create or replace function public.admin_dashboard(
  p_from timestamptz default null,
  p_to timestamptz default null
)
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
      (select e.titulo from public.attendances a
        join public.events e on e.id = a.event_id
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
      e.titulo,
      e.starts_at,
      e.tipo,
      count(a.id) filter (where a.estado = 'asistio')::int as quants
    from public.events e
    left join public.attendances a on a.event_id = e.id
    where e.published
      and e.starts_at < now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
    group by e.id, e.titulo, e.starts_at, e.tipo
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

  -- D'on surten els punts. En percentatges perquè el total no diu res: el que
  -- es llegeix és que gairebé tot ve d'assistir, i per tant que muntar i
  -- conduir són punts fàcils de repartir al gener.
  select coalesce(jsonb_agg(x order by x.punts desc), '[]'::jsonb) into v_motius
  from (
    select
      l.motivo,
      sum(l.puntos)::int as punts,
      count(*)::int as vegades
    from public.points_log l
    where l.puntos > 0
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
    group by l.motivo
  ) x;

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
grant execute on function public.admin_dashboard(timestamptz, timestamptz)
  to authenticated, service_role;

comment on function public.admin_dashboard(timestamptz, timestamptz) is
  'Tot el tauler en una resposta. Cap taula nova: fitxatges, punts, perfils i '
  'períodes. Els despenjats surten de private.streak_rows(), que ja sap quines '
  'activitats comptaven per a cadascú.';

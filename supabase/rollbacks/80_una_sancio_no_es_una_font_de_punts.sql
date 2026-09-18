-- Rollback de la migració 80. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna `admin_dashboard` a la versió de la 48: el bloc `v_motius` recupera el
-- `where l.puntos > 0` i `avis_retirat` torna a ser un motiu propi. Els altres
-- quatre blocs no es toquen ni aquí ni allà; aquest fitxer és el cos de la 48
-- sencer per la mateixa raó que la 80 era el cos de la 48 sencer: Postgres no
-- sap editar el cos d'una funció.
--
-- QUÈ TORNA A OBRIR, escrit sense embuts perquè qui l'apliqui ho sàpiga. El
-- panell tornarà a dir que un avís posat i retirat ha donat +25 punts, i els
-- avisos que es mantenen i els ajustos a mà que resten tornaran a no existir-hi.
-- El perfil del soci seguirà dient la veritat, o sigui que les dues pantalles
-- tornaran a explicar dos cursos diferents.
--
-- LES FILES JA ESCRITES NO ES TOQUEN. `points_log` és append-only per
-- disparador i la 80 no en va moure cap: només canviava com es llegeixen.
--
-- LA PANTALLA NO ES DESFÀ DES D'AQUÍ. `DashboardScreen.tsx` treu del gràfic
-- els motius que no sumen i els posa en una línia de text a sota; amb aquest
-- fitxer aplicat aquella línia es queda buida i el gràfic torna a ser el de
-- sempre, perquè la llista ja no porta cap motiu que no sumi. No queda res
-- trencat, però el desfer de debò és també revertir el commit del client.

create or replace function public.admin_dashboard(p_from timestamptz default null, p_to timestamptz default null)
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
      (select t.titulo from public.attendances a
        join public.events e on e.id = a.event_id
        left join public.event_title t on t.event_id = e.id
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
      t.titulo,
      e.starts_at,
      e.tipo,
      count(a.id) filter (where a.estado = 'asistio')::int as quants
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.published
      -- Una reunió de junta no va a la corba d'assistència: tres persones en
      -- una aula al costat d'una festa de quaranta no és una comparació, és
      -- soroll. Les de comi sí, que hi podia venir tothom. Migració 48.
      and e.abast <> 'junta'
      and e.starts_at < now()
      and (p_from is null or e.starts_at >= p_from)
      and (p_to is null or e.starts_at < p_to)
    group by e.id, t.titulo, e.starts_at, e.tipo
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
grant execute on function public.admin_dashboard(timestamptz, timestamptz) to authenticated;

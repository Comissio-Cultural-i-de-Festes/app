-- Rollback de la migració 97. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Esborra les dues funcions noves (`admin_gimcana_people`, `admin_set_team`) i
-- torna les sis que la 97 reescriu al cos de la migració 40. Cap signatura no
-- ha canviat, o sigui que un `create or replace` n'hi ha prou.
--
-- QUÈ TORNA A OBRIR, i és molt: desar el formulari de la gimcana torna a
-- esborrar totes les fotos enviades; canviar el nom d'un equip torna a treure
-- tothom del seu equip; obrir la gimcana alhora torna a posar tothom al primer
-- equip; en mode junta la gent torna a caure sola a l'equip més petit, i la
-- junta torna a no tenir manera de posar ningú enlloc. El client nou, contra
-- aquesta base, rep un 404 de PostgREST a la pantalla d'equips.
--
-- Cap migració posterior a la 97 toca aquestes funcions el dia que s'escriu.

drop function if exists public.admin_set_team(uuid, uuid, uuid);
drop function if exists public.admin_gimcana_people(uuid);

create or replace function private.gimcana_join_smallest(p_gimcana_id uuid, p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_team uuid := private.gimcana_team(p_gimcana_id, p_user);
begin
  if v_team is not null then
    return v_team;
  end if;

  select e.id into v_team
  from public.gimcana_equips e
  left join public.gimcana_membres m on m.equip_id = e.id
  where e.gimcana_id = p_gimcana_id
  group by e.id, e.ordre
  order by count(m.user_id), e.ordre, e.id
  limit 1;

  if v_team is null then
    return null;
  end if;

  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  values (p_gimcana_id, p_user, v_team)
  on conflict (gimcana_id, user_id) do nothing;

  return private.gimcana_team(p_gimcana_id, p_user);
end;
$$;

alter function private.gimcana_join_smallest(uuid, uuid) owner to postgres;
revoke all on function private.gimcana_join_smallest(uuid, uuid) from public, anon, authenticated;

create or replace function public.gimcana_for_event(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_gimcana public.gimcanes%rowtype;
  v_team    uuid;
  v_proves  jsonb;
  v_equip   jsonb;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select * into v_gimcana from public.gimcanes where event_id = p_event_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- Fins que comença la festa no la veu ningú, i quan acaba es tanca. La junta
  -- sí, perquè l'ha de poder preparar i repassar després.
  if not private.gimcana_is_open(v_gimcana.id) and not private.is_admin() then
    return jsonb_build_object('estat', 'tancada');
  end if;

  -- Triar equip és de qui juga en mode lliure; a la resta se li posa el més
  -- petit si encara no en té cap.
  if v_gimcana.mena_equips = 'lliure' then
    v_team := private.gimcana_team(v_gimcana.id, v_me);
  else
    v_team := private.gimcana_join_smallest(v_gimcana.id, v_me);
  end if;

  select jsonb_build_object('id', e.id, 'nom', e.nom, 'escola', e.escola)
    into v_equip
  from public.gimcana_equips e where e.id = v_team;

  select coalesce(jsonb_agg(x order by x.ordre, x.id), '[]'::jsonb) into v_proves
  from (
    select
      p.id,
      p.ordre,
      p.titol,
      p.descripcio,
      p.punts,
      -- L'estat de la prova per al TEU equip, no per a tu: si un company ja la
      -- va validar, no cal que la tornis a fer.
      (select s.estat from public.gimcana_enviaments s
        where s.prova_id = p.id and s.equip_id = v_team
        order by case s.estat when 'validada' then 1 when 'pendent' then 2 else 3 end,
                 s.created_at desc
        limit 1) as estat,
      (select s.motiu from public.gimcana_enviaments s
        where s.prova_id = p.id and s.equip_id = v_team and s.estat = 'rebutjada'
        order by s.created_at desc limit 1) as motiu,
      (select pr.nombre from public.gimcana_enviaments s
        join public.profiles pr on pr.id = s.user_id
        where s.prova_id = p.id and s.equip_id = v_team and s.estat = 'validada'
        limit 1) as qui
    from public.gimcana_proves p
    where p.gimcana_id = v_gimcana.id
  ) x;

  return jsonb_build_object(
    'estat', 'oberta',
    'id', v_gimcana.id,
    'mena_equips', v_gimcana.mena_equips,
    'topall_equip', v_gimcana.topall_equip,
    'equip', v_equip,
    'proves', v_proves,
    'a_la_cua', (
      select count(*)::int from public.gimcana_enviaments s
      join public.gimcana_proves p on p.id = s.prova_id
      where p.gimcana_id = v_gimcana.id and s.estat = 'pendent')
  );
end;
$$;

alter function public.gimcana_for_event(uuid) owner to postgres;
revoke all on function public.gimcana_for_event(uuid) from public, anon;
grant execute on function public.gimcana_for_event(uuid) to authenticated, service_role;

create or replace function public.pick_team(p_equip_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_equip   public.gimcana_equips%rowtype;
  v_gimcana public.gimcanes%rowtype;
  v_quants  int;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select * into v_equip from public.gimcana_equips where id = p_equip_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  select * into v_gimcana from public.gimcanes where id = v_equip.gimcana_id;

  if v_gimcana.mena_equips <> 'lliure' then
    return jsonb_build_object('estat', 'no_es_tria');
  end if;

  -- El bloqueig fa que dos que premen alhora no passin tots dos el topall.
  perform pg_advisory_xact_lock(hashtext('gimcana:' || v_equip.gimcana_id::text));

  if v_gimcana.topall_equip is not null then
    select count(*)::int into v_quants
    from public.gimcana_membres m
    where m.equip_id = p_equip_id and m.user_id <> v_me;

    if v_quants >= v_gimcana.topall_equip then
      return jsonb_build_object('estat', 'ple');
    end if;
  end if;

  -- Canviar d'equip és el mateix gest que triar-ne un: mentre no hagis enviat
  -- res, no hi ha res a moure.
  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  values (v_equip.gimcana_id, v_me, p_equip_id)
  on conflict (gimcana_id, user_id) do update set equip_id = excluded.equip_id;

  return jsonb_build_object('estat', 'fet', 'equip', p_equip_id);
end;
$$;

alter function public.pick_team(uuid) owner to postgres;
revoke all on function public.pick_team(uuid) from public, anon;
grant execute on function public.pick_team(uuid) to authenticated, service_role;

create or replace function public.admin_save_gimcana(
  p_event_id uuid,
  p_mena_equips text,
  p_proves jsonb,
  -- Sense topall per defecte: només en té sentit en mode lliure, i obligar el
  -- client a enviar un null explícit per als altres tres seria demanar-li que
  -- digui una cosa que no vol dir res.
  p_topall int default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_gimcana public.gimcanes%rowtype;
  v_escola  text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_mena_equips not in ('escoles', 'junta', 'sorteig', 'lliure') then
    raise exception 'mena d''equips desconeguda' using errcode = '22023';
  end if;

  insert into public.gimcanes (event_id, mena_equips, topall_equip, created_by)
  values (p_event_id, p_mena_equips, p_topall, v_me)
  on conflict (event_id) do update
    set mena_equips = excluded.mena_equips, topall_equip = excluded.topall_equip
  returning * into v_gimcana;

  -- En mode escoles els equips són sempre els mateixos tres i no els posa
  -- ningú a mà. Sense nom: el nom d'una escola ja viu a les traduccions.
  if p_mena_equips = 'escoles' then
    foreach v_escola in array array['politecnica', 'empresa', 'salut'] loop
      insert into public.gimcana_equips (gimcana_id, escola, ordre)
      values (v_gimcana.id, v_escola,
              case v_escola when 'politecnica' then 1 when 'empresa' then 2 else 3 end)
      on conflict (gimcana_id, escola) do nothing;
    end loop;
  end if;

  -- Les proves es reescriuen senceres. Esborrar-ne una que ja té enviaments
  -- s'emporta els enviaments per cascada, i és el que ha de passar: una prova
  -- que ja no hi és no pot seguir puntuant.
  delete from public.gimcana_proves where gimcana_id = v_gimcana.id;

  insert into public.gimcana_proves (gimcana_id, titol, descripcio, punts, ordre)
  select
    v_gimcana.id,
    x.titol,
    nullif(x.descripcio, ''),
    x.punts,
    x.ordre
  from jsonb_to_recordset(coalesce(p_proves, '[]'::jsonb))
    as x(titol text, descripcio text, punts int, ordre int);

  return jsonb_build_object('estat', 'desada', 'id', v_gimcana.id);
end;
$$;

alter function public.admin_save_gimcana(uuid, text, jsonb, int) owner to postgres;
revoke all on function public.admin_save_gimcana(uuid, text, jsonb, int) from public, anon;
grant execute on function public.admin_save_gimcana(uuid, text, jsonb, int)
  to authenticated, service_role;


create or replace function public.admin_save_teams(p_gimcana_id uuid, p_noms text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom text;
  v_i   int := 0;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_proves p on p.id = s.prova_id
    where p.gimcana_id = p_gimcana_id and s.estat = 'validada'
  ) then
    return jsonb_build_object('estat', 'ja_jugada');
  end if;

  delete from public.gimcana_equips where gimcana_id = p_gimcana_id;

  foreach v_nom in array coalesce(p_noms, array[]::text[]) loop
    v_i := v_i + 1;
    insert into public.gimcana_equips (gimcana_id, nom, ordre)
    values (p_gimcana_id, v_nom, v_i);
  end loop;

  return jsonb_build_object('estat', 'desats', 'quants', v_i);
end;
$$;

alter function public.admin_save_teams(uuid, text[]) owner to postgres;
revoke all on function public.admin_save_teams(uuid, text[]) from public, anon;
grant execute on function public.admin_save_teams(uuid, text[]) to authenticated, service_role;

create or replace function public.admin_shuffle_teams(p_gimcana_id uuid, p_quants int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- `v_i` no es declara: el `for` de sota es fa la seva pròpia variable i
  -- declarar-la aquí n'hi hauria dues amb el mateix nom.
  v_event uuid;
  v_ids   uuid[];
  v_gent  int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_quants < 2 or p_quants > 12 then
    raise exception 'entre dos i dotze equips' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_proves p on p.id = s.prova_id
    where p.gimcana_id = p_gimcana_id and s.estat = 'validada'
  ) then
    return jsonb_build_object('estat', 'ja_jugada');
  end if;

  select event_id into v_event from public.gimcanes where id = p_gimcana_id;
  if v_event is null then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  delete from public.gimcana_equips where gimcana_id = p_gimcana_id;

  for v_i in 1..p_quants loop
    insert into public.gimcana_equips (gimcana_id, nom, ordre)
    values (p_gimcana_id, null, v_i);
  end loop;

  select array_agg(id order by ordre) into v_ids
  from public.gimcana_equips where gimcana_id = p_gimcana_id;

  -- Repartits en rodona sobre un ordre a l'atzar: així els equips queden
  -- igualats encara que la gent no sigui múltiple del nombre d'equips.
  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  select
    p_gimcana_id,
    a.user_id,
    v_ids[1 + ((row_number() over (order by random()) - 1)::int % p_quants)]
  from public.attendances a
  where a.event_id = v_event and a.estado = 'asistio'
  on conflict (gimcana_id, user_id) do update set equip_id = excluded.equip_id;

  get diagnostics v_gent = row_count;
  return jsonb_build_object('estat', 'remenats', 'equips', p_quants, 'gent', v_gent);
end;
$$;

alter function public.admin_shuffle_teams(uuid, int) owner to postgres;
revoke all on function public.admin_shuffle_teams(uuid, int) from public, anon;
grant execute on function public.admin_shuffle_teams(uuid, int) to authenticated, service_role;

comment on function public.admin_shuffle_teams(uuid, int) is
  'Reparteix a l''atzar qui ha fitxat. Es nega si ja hi ha cap prova validada: '
  'remenar a mitja partida invalidaria el marcador.';

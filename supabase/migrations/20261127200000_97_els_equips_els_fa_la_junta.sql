-- Els equips de la gimcana els fa la junta, els pot editar, i un error s'arregla.
--
-- La primera nit que es va fer servir de debò (la casa rural, novembre del 2026)
-- tothom va caure al primer equip. Hi havia quatre coses dolentes alhora, i
-- aquesta migració les tanca totes:
--
-- 1. `gimcana_join_smallest` NO BLOQUEJAVA RES. Quaranta mòbils obrint la
--    gimcana el mateix minut veien tots els equips buits —cap transacció veu
--    les files de les altres fins que no fan commit— i tots triaven l'equip 1.
--    Ara pren el mateix bloqueig consultiu que `pick_team` i torna a mirar
--    després d'esperar-lo. Llegir, bloquejar i tornar a llegir: la segona
--    lectura és una sentència nova i en READ COMMITTED veu el commit de qui
--    tenia el bloqueig abans.
--
-- 2. EL MODE «LA JUNTA» NO TENIA CAP MANERA DE REPARTIR LA GENT. La pantalla
--    deia «repartiu la gent vosaltres», `gimcana_membres` no té INSERT per a
--    `authenticated` (a posta: escriure-hi és decidir amb qui juga algú), i cap
--    RPC no deixava la junta posar-hi ningú. A la pràctica era un sorteig sense
--    botó de remenar. Ara hi ha `admin_gimcana_people` per veure-ho i
--    `admin_set_team` per posar, moure i treure; i en aquest mode ningú no
--    cau sol en cap equip: qui obre la gimcana sense equip espera la junta.
--    `submit_prova` ja contestava `sense_equip` quan `join_smallest` torna
--    null, o sigui que no cal tocar-la (és de la 95 i és qui vigila el camí de
--    la foto: com menys mans la toquin, millor).
--
-- 3. EDITAR ESBORRAVA. `admin_save_teams` i `admin_shuffle_teams` esborraven
--    tots els equips per tornar-los a crear, i `gimcana_membres.equip_id` i
--    `gimcana_enviaments.equip_id` són `on delete cascade`: canviar el nom d'un
--    equip treia tothom del seu equip i s'enduia les fotos que haguessin
--    enviat. `admin_save_gimcana` feia el mateix amb les proves —esborrar-les i
--    tornar-les a fer a cada desat—, o sigui que corregir una falta d'ortografia
--    a mitja gimcana s'enduia totes les fotos de la nit. Ara tot s'edita al seu
--    lloc: els equips per `ordre`, les proves per `id`. Només s'esborra el que
--    la junta ha tret de la llista, i un equip que té fotos no es pot treure.
--
--    REBUTJAT: posar `on delete restrict` a les claus. Hauria fet que esborrar
--    una activitat sencera petés per culpa d'una foto de la gimcana, i la
--    cascada des de l'activitat és el que es vol. El que no es vol és que
--    EDITAR sigui esborrar, i això es tanca a les funcions que editen.
--
-- 4. QUI S'EQUIVOCAVA NO HO PODIA ARREGLAR. `pick_team` deixava canviar
--    d'equip sempre —el comentari deia «mentre no hagis enviat res», el codi no
--    ho mirava— però la pantalla no ensenyava mai la llista a qui ja en tenia.
--    Ara el servidor compleix el que diu (`ja_has_enviat`), `gimcana_for_event`
--    diu `pots_canviar` perquè la pantalla sàpiga quan oferir-ho, i quan ja no
--    es pot, ho arregla la junta amb `admin_set_team`.
--
-- Cap signatura existent no canvia: totes són `create or replace` sobre el cos
-- de la migració 40, i el client vell (la PWA a la memòria cau de qualsevol
-- mòbil) segueix funcionant contra aquesta base. Un client vell que desa la
-- gimcana no envia `id` a les proves, i llavors es comporta com abans.

-- ── 1. el més petit, d'un en un ─────────────────────────────────────────────
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

  -- En mode junta els equips els fa la junta. Posar algú al més petit «de
  -- moment» és el que va passar a la casa rural: la persona veu un equip, en
  -- parla amb els d'aquell equip, i deu minuts després la junta el mou.
  if (select g.mena_equips from public.gimcanes g where g.id = p_gimcana_id) = 'junta' then
    return null;
  end if;

  -- La mateixa clau que `pick_team` i `admin_set_team`: qui tria, qui cau i
  -- qui reparteix fan cua junts, i el recompte de sota és el de debò.
  perform pg_advisory_xact_lock(hashtext('gimcana:' || p_gimcana_id::text));

  v_team := private.gimcana_team(p_gimcana_id, p_user);
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

-- ── 4. el que veu qui juga, i si pot canviar d'equip ────────────────────────
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

  -- Triar equip és de qui juga en mode lliure; en sorteig se li posa el més
  -- petit si encara no en té cap, i en mode junta espera que la junta l'hi
  -- posi (`gimcana_join_smallest` torna null).
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
      where p.gimcana_id = v_gimcana.id and s.estat = 'pendent'),
    -- La mateixa condició que `pick_team`, dita abans perquè la pantalla no
    -- ofereixi un botó que el servidor refusarà.
    'pots_canviar', (
      v_gimcana.mena_equips = 'lliure'
      and v_team is not null
      and not exists (
        select 1 from public.gimcana_enviaments s
        join public.gimcana_proves p on p.id = s.prova_id
        where p.gimcana_id = v_gimcana.id and s.user_id = v_me))
  );
end;
$$;

alter function public.gimcana_for_event(uuid) owner to postgres;
revoke all on function public.gimcana_for_event(uuid) from public, anon;
grant execute on function public.gimcana_for_event(uuid) to authenticated, service_role;

-- ── 4. triar equip, en mode lliure, mentre no hagis enviat res ──────────────
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

  -- Tornar a triar el teu no és canviar.
  if private.gimcana_team(v_gimcana.id, v_me) = p_equip_id then
    return jsonb_build_object('estat', 'fet', 'equip', p_equip_id);
  end if;

  -- Canviar d'equip és el mateix gest que triar-ne un, però només mentre no
  -- hagis enviat res. Després, les teves fotos ja són d'un equip, i moure't
  -- és una decisió de la junta (`admin_set_team`), no d'un toc teu.
  if private.gimcana_team(v_gimcana.id, v_me) is not null and exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_proves p on p.id = s.prova_id
    where p.gimcana_id = v_gimcana.id and s.user_id = v_me
  ) then
    return jsonb_build_object('estat', 'ja_has_enviat');
  end if;

  if v_gimcana.topall_equip is not null then
    select count(*)::int into v_quants
    from public.gimcana_membres m
    where m.equip_id = p_equip_id and m.user_id <> v_me;

    if v_quants >= v_gimcana.topall_equip then
      return jsonb_build_object('estat', 'ple');
    end if;
  end if;

  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  values (v_equip.gimcana_id, v_me, p_equip_id)
  on conflict (gimcana_id, user_id) do update set equip_id = excluded.equip_id;

  return jsonb_build_object('estat', 'fet', 'equip', p_equip_id);
end;
$$;

alter function public.pick_team(uuid) owner to postgres;
revoke all on function public.pick_team(uuid) from public, anon;
grant execute on function public.pick_team(uuid) to authenticated, service_role;

-- ── 2. qui hi ha, per repartir-los ──────────────────────────────────────────
-- Qui s'ha apuntat a l'activitat o hi ha fitxat, i qui ja és en un equip
-- encara que no sigui cap de les dues coses (la junta l'hi pot haver posat).
-- Apuntats i no només fitxats: els equips es fan sovint abans que arribi la
-- gent, i qui no ha passat per la porta no es pot quedar sense lloc a la
-- llista. `ha_arribat` és el que diferencia els dos.
create or replace function public.admin_gimcana_people(p_gimcana_id uuid)
returns table (
  user_id    uuid,
  nombre     text,
  avatar_url text,
  equip_id   uuid,
  ha_arribat boolean,
  fotos      int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select g.event_id into v_event from public.gimcanes g where g.id = p_gimcana_id;

  return query
  with gent as (
    select a.user_id as uid from public.attendances a
    where a.event_id = v_event and a.estado in ('si', 'asistio')
    union
    select m.user_id from public.gimcana_membres m where m.gimcana_id = p_gimcana_id
  )
  select
    p.id,
    p.nombre,
    p.avatar_url,
    private.gimcana_team(p_gimcana_id, p.id),
    exists (
      select 1 from public.attendances a
      where a.event_id = v_event and a.user_id = p.id and a.estado = 'asistio'),
    (select count(*)::int from public.gimcana_enviaments s
      join public.gimcana_proves pr on pr.id = s.prova_id
      where pr.gimcana_id = p_gimcana_id and s.user_id = p.id)
  from gent
  join public.profiles p on p.id = gent.uid
  order by p.nombre, p.id;
end;
$$;

alter function public.admin_gimcana_people(uuid) owner to postgres;
revoke all on function public.admin_gimcana_people(uuid) from public, anon;
grant execute on function public.admin_gimcana_people(uuid) to authenticated, service_role;

-- ── 2. posar, moure i treure ────────────────────────────────────────────────
-- Sense topall: el topall és perquè la gent no s'amuntegui triant sola, i la
-- junta, que veu tota la llista, és qui decideix. Les fotos que la persona ja
-- hagi enviat es queden a l'equip on es van fer: moure algú no pot treure
-- punts a un equip ni regalar-ne a un altre.
--
-- `p_equip_id` per defecte null vol dir «treu-lo de l'equip». És una funció
-- nova, o sigui que el valor per defecte no crea cap sobrecàrrega.
create or replace function public.admin_set_team(
  p_gimcana_id uuid,
  p_user_id uuid,
  p_equip_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mena text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select g.mena_equips into v_mena from public.gimcanes g where g.id = p_gimcana_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  -- En mode escoles l'equip surt del perfil i `gimcana_membres` és buida.
  if v_mena = 'escoles' then
    return jsonb_build_object('estat', 'no_es_tria');
  end if;

  if p_equip_id is not null and not exists (
    select 1 from public.gimcana_equips e
    where e.id = p_equip_id and e.gimcana_id = p_gimcana_id
  ) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  perform pg_advisory_xact_lock(hashtext('gimcana:' || p_gimcana_id::text));

  if p_equip_id is null then
    delete from public.gimcana_membres m
    where m.gimcana_id = p_gimcana_id and m.user_id = p_user_id;
  else
    insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
    values (p_gimcana_id, p_user_id, p_equip_id)
    on conflict (gimcana_id, user_id) do update set equip_id = excluded.equip_id;
  end if;

  return jsonb_build_object('estat', 'fet', 'equip', p_equip_id);
end;
$$;

alter function public.admin_set_team(uuid, uuid, uuid) owner to postgres;
revoke all on function public.admin_set_team(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_set_team(uuid, uuid, uuid) to authenticated, service_role;

-- ── 3. desar la gimcana sense esborrar les fotos ────────────────────────────
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
  v_proves  jsonb := coalesce(p_proves, '[]'::jsonb);
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

  -- Les proves s'editen al seu lloc. Una prova que la junta ha tret de la
  -- llista s'esborra, i amb ella els seus enviaments, que és el que ha de
  -- passar: una prova que ja no hi és no pot seguir puntuant. Una que segueix
  -- a la llista conserva el seu `id`, i per tant les seves fotos.
  --
  -- Un client d'abans de la 97 no envia `id`: llavors cap prova no «segueix» i
  -- es comporta exactament com abans (esborrar-les totes i tornar-les a fer).
  delete from public.gimcana_proves p
  where p.gimcana_id = v_gimcana.id
    and p.id not in (
      select (x ->> 'id')::uuid
      from jsonb_array_elements(v_proves) x
      where nullif(x ->> 'id', '') is not null
    );

  update public.gimcana_proves p
  set titol = x.titol,
      descripcio = nullif(x.descripcio, ''),
      punts = x.punts,
      ordre = x.ordre
  from jsonb_to_recordset(v_proves)
    as x(id uuid, titol text, descripcio text, punts int, ordre int)
  where x.id is not null
    and p.id = x.id
    and p.gimcana_id = v_gimcana.id;

  -- Les noves, i també qualsevol `id` que no sigui d'aquesta gimcana: una
  -- prova no es pot robar d'una altra activitat enviant-ne l'identificador.
  insert into public.gimcana_proves (gimcana_id, titol, descripcio, punts, ordre)
  select
    v_gimcana.id,
    x.titol,
    nullif(x.descripcio, ''),
    x.punts,
    x.ordre
  from jsonb_to_recordset(v_proves)
    as x(id uuid, titol text, descripcio text, punts int, ordre int)
  where x.id is null
     or not exists (
       select 1 from public.gimcana_proves p
       where p.id = x.id and p.gimcana_id = v_gimcana.id);

  return jsonb_build_object('estat', 'desada', 'id', v_gimcana.id);
end;
$$;

alter function public.admin_save_gimcana(uuid, text, jsonb, int) owner to postgres;
revoke all on function public.admin_save_gimcana(uuid, text, jsonb, int) from public, anon;
grant execute on function public.admin_save_gimcana(uuid, text, jsonb, int)
  to authenticated, service_role;

-- ── 3. els noms dels equips, sense treure ningú ─────────────────────────────
-- Equip a equip per `ordre`: el primer nom és l'equip 1, i així. Els que hi
-- eren conserven l'`id`, i amb ell la gent i les fotos. Si la llista és més
-- curta, els que sobren s'esborren, però només si cap no té fotos: un equip
-- que ha jugat no desapareix amb un toc. Qui era a un equip esborrat es queda
-- sense equip, i torna a passar pel camí del seu mode.
--
-- Un nom buit vol dir «sense nom», que es mostra com «Equip N». Abans petava
-- amb la restricció de llargada i la junta no sabia per què.
create or replace function public.admin_save_teams(p_gimcana_id uuid, p_noms text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_mena text;
  v_n    int := coalesce(array_length(p_noms, 1), 0);
  v_nom  text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select g.mena_equips into v_mena from public.gimcanes g where g.id = p_gimcana_id;
  if not found then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  if v_mena = 'escoles' then
    return jsonb_build_object('estat', 'no_es_tria');
  end if;

  perform pg_advisory_xact_lock(hashtext('gimcana:' || p_gimcana_id::text));

  if exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_equips e on e.id = s.equip_id
    where e.gimcana_id = p_gimcana_id and e.ordre > v_n
  ) then
    return jsonb_build_object('estat', 'equip_amb_fotos');
  end if;

  delete from public.gimcana_equips e
  where e.gimcana_id = p_gimcana_id and e.ordre > v_n;

  for v_i in 1..v_n loop
    v_nom := nullif(btrim(p_noms[v_i]), '');

    update public.gimcana_equips e
    set nom = v_nom
    where e.gimcana_id = p_gimcana_id and e.ordre = v_i;

    if not found then
      insert into public.gimcana_equips (gimcana_id, nom, ordre)
      values (p_gimcana_id, v_nom, v_i);
    end if;
  end loop;

  return jsonb_build_object('estat', 'desats', 'quants', v_n);
end;
$$;

alter function public.admin_save_teams(uuid, text[]) owner to postgres;
revoke all on function public.admin_save_teams(uuid, text[]) from public, anon;
grant execute on function public.admin_save_teams(uuid, text[]) to authenticated, service_role;

-- ── 3. remenar, sense perdre ni noms ni fotos ───────────────────────────────
-- Reparteix a l'atzar qui ha fitxat aquella nit. Es nega si ja hi ha QUALSEVOL
-- foto, no només una de validada: les pendents també són d'un equip, i
-- remenar-les seria donar-les a un altre o esborrar-les.
--
-- Els equips que ja hi eren es queden (amb el seu nom); només se n'afegeixen o
-- se'n treuen fins a arribar a `p_quants`. El que sí es refà sencer és qui és
-- a cada equip, també el que la junta hagi posat a mà: remenar és això, i la
-- pantalla ho demana confirmar abans.
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

  select event_id into v_event from public.gimcanes where id = p_gimcana_id;
  if v_event is null then
    return jsonb_build_object('estat', 'no_hi_es');
  end if;

  perform pg_advisory_xact_lock(hashtext('gimcana:' || p_gimcana_id::text));

  if exists (
    select 1 from public.gimcana_enviaments s
    join public.gimcana_proves p on p.id = s.prova_id
    where p.gimcana_id = p_gimcana_id
  ) then
    return jsonb_build_object('estat', 'ja_jugada');
  end if;

  delete from public.gimcana_equips
  where gimcana_id = p_gimcana_id and ordre > p_quants;

  for v_i in 1..p_quants loop
    if not exists (
      select 1 from public.gimcana_equips
      where gimcana_id = p_gimcana_id and ordre = v_i
    ) then
      insert into public.gimcana_equips (gimcana_id, nom, ordre)
      values (p_gimcana_id, null, v_i);
    end if;
  end loop;

  select array_agg(id order by ordre, id) into v_ids
  from public.gimcana_equips where gimcana_id = p_gimcana_id;

  delete from public.gimcana_membres where gimcana_id = p_gimcana_id;

  -- Repartits en rodona sobre un ordre a l'atzar: així els equips queden
  -- igualats encara que la gent no sigui múltiple del nombre d'equips.
  insert into public.gimcana_membres (gimcana_id, user_id, equip_id)
  select
    p_gimcana_id,
    a.user_id,
    v_ids[1 + ((row_number() over (order by random()) - 1)::int % p_quants)]
  from public.attendances a
  where a.event_id = v_event and a.estado = 'asistio';

  get diagnostics v_gent = row_count;
  return jsonb_build_object('estat', 'remenats', 'equips', p_quants, 'gent', v_gent);
end;
$$;

alter function public.admin_shuffle_teams(uuid, int) owner to postgres;
revoke all on function public.admin_shuffle_teams(uuid, int) from public, anon;
grant execute on function public.admin_shuffle_teams(uuid, int) to authenticated, service_role;

comment on function public.admin_shuffle_teams(uuid, int) is
  'Reparteix a l''atzar qui ha fitxat. Conserva els equips i els seus noms; '
  'es nega si ja hi ha cap foto enviada, validada o no.';

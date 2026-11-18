-- Rollback de la migració 93. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu la validació per una segona persona: les columnes `punts`, `validat_at` i
-- `validat_by`, `valida_avis()`, el nucli que valida, la notificació i el sostre
-- compartit. `private.registra_avis`, `avisa()` i `edita_mesura_presa()` tornen
-- al cos de la 86; `retira_avis()` al de la 73; `enllaca_avis_pendent()` al de
-- la 87; la política de lectura i el CHECK del registre, als d'abans.
--
-- AQUEST FITXER DECIDEIX QUÈ FER AMB ELS PROPOSATS QUE ESPEREN, i es diu aquí.
-- Sense la columna, un proposat seria un avís que compta sense haver restat els
-- seus punts: ni una cosa ni l'altra. Es tanquen com a RETIRATS, amb el motiu
-- escrit, abans de treure la columna: la fila es queda com a història i no
-- compta per a cap escaló. Si la junta els vol, els ha de tornar a posar.
--
-- I PERD INFORMACIÓ: qui va validar cada avís se'n va amb la columna, i les
-- files del registre de `valida_avis` i `rebutja_avis` s'esborren perquè el
-- CHECK de la 87 no les admet. Si s'ha d'executar, el que cal fer abans és
-- guardar-se-les.

update public.avisos
   set retirat_at = now(),
       retirat_nota = 'Proposta que esperava validacio quan es va desfer la migracio 93'
 where validat_at is null and retirat_at is null;

delete from public.audit_log where accio in ('valida_avis', 'rebutja_avis');

drop function if exists public.valida_avis(uuid);
drop function if exists private.compta_avis(uuid, uuid);
drop function if exists private.avisa_push(uuid, text);

drop policy avisos_select_self_or_admin on public.avisos;
create policy avisos_select_self_or_admin on public.avisos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ── el nucli, com a la 86 ──────────────────────────────────────────────────
create or replace function private.registra_avis(
  p_user_id            uuid,
  p_tipus              text,
  p_gravetat           int,
  p_gravetat_suggerida int,
  p_nota               text,
  p_punts              int,
  p_event_id           uuid,
  p_quan               timestamptz,
  p_actor              uuid,
  p_detall             jsonb,
  p_mesura_presa       text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_id            uuid;
  v_nota          text := private.nota_neta(coalesce(p_nota, ''));
  -- Opcional: en blanc vol dir que no se n'ha pres cap, i es desa null.
  v_mesura        text := private.nota_neta(coalesce(p_mesura_presa, ''));
  v_punts         int  := coalesce(p_punts, 0);
  v_punts_event   uuid;
  v_points_log_id uuid;
  v_sostre        int;
  v_ja            int;
  v_des_de        timestamptz;
  v_fins_a        timestamptz;
begin
  if v_nota is null then
    raise exception 'un avis sense motiu escrit no es un avis' using errcode = '22023';
  end if;
  if length(v_nota) > 500 then
    raise exception 'la nota es massa llarga' using errcode = '22023';
  end if;

  if v_mesura is not null and length(v_mesura) > 500 then
    raise exception 'la mesura presa es massa llarga' using errcode = '22023';
  end if;

  if p_gravetat_suggerida is null
     or not exists (select 1 from public.avis_tipus t where t.clau = p_tipus) then
    raise exception 'tipus d''avis desconegut' using errcode = '22023';
  end if;

  if p_gravetat is null or p_gravetat not between 1 and 3 then
    raise exception 'la gravetat va d''1 a 3' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_user_id and p.estat in ('actiu', 'baixa')
  ) then
    raise exception 'aquesta persona no es de l''associacio' using errcode = '22023';
  end if;

  if v_punts > 0 then
    raise exception 'un avis no dona punts' using errcode = '22023';
  end if;
  if abs(v_punts) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;

  -- El sostre, tal com el va deixar la 81: el saldo d'avisos del curs,
  -- compensacions incloses, amb cada moviment al curs de l'avis que l'explica.
  if v_punts < 0 then
    select pv.punts into v_sostre
      from public.point_values pv
     where pv.mena = 'avisos' and pv.clau = 'sostre_curs';

    if coalesce(v_sostre, 0) > 0 then
      select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

      if (v_des_de is not null and p_quan <  v_des_de)
      or (v_fins_a is not null and p_quan >= v_fins_a) then
        raise exception 'avui no cau dins de cap curs'
          using errcode = '22023', hint = 'avis_fora_del_curs';
      end if;

      select coalesce(sum(x.puntos), 0)::int into v_ja
        from (
          select pl.puntos,
                 coalesce(
                   (select a.created_at
                      from public.avisos a
                     where a.points_log_id = pl.id
                        or a.retirat_points_log_id = pl.id
                     limit 1),
                   pl.created_at
                 ) as quan
            from public.points_log pl
           where pl.user_id = p_user_id
             and pl.motivo in ('avis', 'avis_retirat')
        ) x
       where (v_des_de is null or x.quan >= v_des_de)
         and (v_fins_a is null or x.quan <  v_fins_a);

      if abs(v_ja + v_punts) > v_sostre then
        raise exception 'sostre de punts del curs'
          using errcode = '22023', hint = 'avis_sostre';
      end if;
    end if;
  end if;

  if v_punts <> 0 then
    v_punts_event := p_event_id;
    if v_punts_event is not null and exists (
      select 1 from public.events e where e.id = v_punts_event and e.abast = 'junta'
    ) then
      v_punts_event := null;
    end if;

    -- AMB LA DATA DE L'AVÍS i no amb `now()`. El rànquing llegeix
    -- `coalesce(e.starts_at, pl.created_at)`, o sigui que una fila sense
    -- esdeveniment cau al període del seu `created_at`: un avís del 14
    -- d'octubre ha de restar al trimestre del 14 d'octubre.
    insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by, created_at)
    values (p_user_id, v_punts_event, 'avis', v_punts, v_nota, p_actor, p_quan)
    returning id into v_points_log_id;
  end if;

  insert into public.avisos (
    user_id, tipus, gravetat, nota, mesura_presa, event_id, points_log_id, created_by, created_at
  )
  values (
    p_user_id, p_tipus, p_gravetat, v_nota, v_mesura, p_event_id, v_points_log_id, p_actor, p_quan
  )
  returning id into v_id;

  -- SENSE LA NOTA A POSTA, com a la 73: `audit_log` es purga als 24 mesos i el
  -- llegeix tota la junta; la nota viu a `avisos`, que es on la pot llegir qui
  -- hi surt.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    p_actor,
    'avis',
    p_user_id,
    jsonb_build_object(
      'avis', v_id, 'tipus', p_tipus,
      'gravetat', p_gravetat, 'gravetat_suggerida', p_gravetat_suggerida,
      'punts', v_punts, 'esdeveniment', p_event_id,
      'amb_mesura', v_mesura is not null
    ) || coalesce(p_detall, '{}'::jsonb)
  );

  return v_id;
end $fn$;

drop function if exists private.comprova_sostre_avisos(uuid, int, timestamptz, boolean, uuid);

alter table public.avisos
  drop constraint if exists avisos_proposat_sense_punts,
  drop constraint if exists avisos_validat_sencer,
  drop column if exists validat_by,
  drop column if exists validat_at,
  drop column if exists punts;

-- ── la porta, com a la 86 ──────────────────────────────────────────────────
create or replace function public.avisa(
  p_user_id  uuid,
  p_tipus    text,
  p_nota     text,
  p_punts    int  default 0,
  p_event_id uuid default null,
  p_gravetat int  default null,
  p_mesura_presa text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_suggerida int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  -- Només els tipus actius: retirar-ne un del catàleg és treure'l del
  -- formulari. Si no es troba, el nucli ho refusa després de mirar la nota,
  -- que és l'ordre de sempre.
  select t.gravetat into v_suggerida
    from public.avis_tipus t
   where t.clau = p_tipus and t.actiu;

  return private.registra_avis(
    p_user_id,
    p_tipus,
    coalesce(p_gravetat, v_suggerida),
    v_suggerida,
    p_nota,
    p_punts,
    p_event_id,
    now(),
    (select auth.uid()),
    '{}'::jsonb,
    p_mesura_presa
  );
end $fn$;

-- ── retirar, com a la 73 ───────────────────────────────────────────────────
-- Amb una diferència, a posta: la nota es neteja amb `private.nota_neta`, com
-- a la 93, i no amb el `btrim` de la 73. Desfer la segona persona no ha de
-- reobrir el forat del tabulador que la 77 va tancar.
create or replace function public.retira_avis(p_avis_id uuid, p_nota text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_avis   public.avisos%rowtype;
  v_punts  int;
  v_nota   text := private.nota_neta(coalesce(p_nota, ''));
  v_comp   uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if v_nota is null then
    raise exception 'retirar un avis tambe demana un motiu escrit' using errcode = '22023';
  end if;
  if length(v_nota) > 500 then
    raise exception 'la nota es massa llarga' using errcode = '22023';
  end if;

  select * into v_avis from public.avisos where id = p_avis_id for update;
  if not found then
    raise exception 'aquest avis no existeix' using errcode = '22023';
  end if;
  if v_avis.retirat_at is not null then
    raise exception 'aquest avis ja esta retirat' using errcode = '22023';
  end if;

  if v_avis.points_log_id is not null then
    select pl.puntos into v_punts
      from public.points_log pl where pl.id = v_avis.points_log_id;

    insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
    values (v_avis.user_id, null, 'avis_retirat', -v_punts, v_nota, (select auth.uid()))
    returning id into v_comp;
  end if;

  update public.avisos
     set retirat_at = now(),
         retirat_by = (select auth.uid()),
         retirat_nota = v_nota,
         retirat_points_log_id = v_comp
   where id = p_avis_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'retira_avis',
    v_avis.user_id,
    jsonb_build_object('avis', p_avis_id, 'punts', coalesce(-v_punts, 0))
  );
end $fn$;

-- ── la mesura presa, com a la 86 ───────────────────────────────────────────
create or replace function public.edita_mesura_presa(p_avis_id uuid, p_mesura text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_avis   public.avisos%rowtype;
  v_mesura text := private.nota_neta(coalesce(p_mesura, ''));
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if v_mesura is not null and length(v_mesura) > 500 then
    raise exception 'la mesura presa es massa llarga' using errcode = '22023';
  end if;

  select * into v_avis from public.avisos where id = p_avis_id for update;
  if not found then
    raise exception 'aquest avis no existeix' using errcode = '22023';
  end if;

  update public.avisos set mesura_presa = v_mesura where id = p_avis_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'edita_mesura_presa',
    v_avis.user_id,
    jsonb_build_object(
      'avis', p_avis_id,
      'abans', v_avis.mesura_presa is not null,
      'ara', v_mesura is not null
    )
  );
end $fn$;

-- ── l'enllaç a mà, com a la 87 ─────────────────────────────────────────────
create or replace function public.enllaca_avis_pendent(p_id uuid, p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_p    public.avisos_pendents%rowtype;
  v_avis uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_p from public.avisos_pendents where id = p_id for update;
  if not found then
    raise exception 'aquest pendent no existeix' using errcode = '22023';
  end if;
  if v_p.enllacat_at is not null or v_p.retirat_at is not null then
    raise exception 'aquest pendent ja esta resolt' using errcode = '22023';
  end if;

  v_avis := private.enganxa_pendent(p_id, p_user_id, 'ma', (select auth.uid()));

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'enllaca_avis_pendent',
    p_user_id,
    jsonb_build_object('pendent', p_id, 'avis', v_avis)
  );

  return v_avis;
end $fn$;

-- ── el registre, com a la 87 ───────────────────────────────────────────────
alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'avis',
    'avis_pendent',
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
    'edita_mesura_presa',
    'enllaca_avis_pendent',
    'hores_persona',
    'retira_avis',
    'retira_avis_pendent',
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
    'set_avis_tipus',
    'set_estat',
    'set_hores',
    'set_paid',
    'set_point_value',
    'set_published',
    'set_role',
    'transfer_owner',
    'undo_checkin',
    'visa_hores'
  ));

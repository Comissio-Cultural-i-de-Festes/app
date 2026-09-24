-- Rollback de la migració 86. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu la mesura presa: la columna, la RPC que l'edita, el paràmetre d'`avisa()`
-- i l'acció del registre. `avisa()` i `private.registra_avis` tornen al cos de
-- la 85 sencer.
--
-- AQUEST FITXER PERD INFORMACIÓ, i es diu aquí perquè no s'amagui: les mesures
-- que la junta hagi escrit se'n van amb la columna, i les files del registre
-- d'`edita_mesura_presa` s'esborren perquè el CHECK de la 73 no les admet. Si
-- s'ha d'executar amb mesures escrites, el que cal fer abans és guardar-se-les.
--
-- ORDRE: aquest va DESPRÉS del de la 87 —els pendents criden el nucli amb la
-- firma d'aquí, i sense la 87 desfeta es quedarien cridant una funció que no
-- existeix— i ABANS que el de la 85, que torna `avisa()` a la de la 81.

drop function if exists public.edita_mesura_presa(uuid, text);
drop function if exists public.avisa(uuid, text, text, int, uuid, int, text);
drop function if exists private.registra_avis(uuid, text, int, int, text, int, uuid, timestamptz, uuid, jsonb, text);

alter table public.avisos drop column if exists mesura_presa;

delete from public.audit_log where accio = 'edita_mesura_presa';

-- ── el nucli ───────────────────────────────────────────────────────────────
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
  p_detall             jsonb
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
    user_id, tipus, gravetat, nota, event_id, points_log_id, created_by, created_at
  )
  values (
    p_user_id, p_tipus, p_gravetat, v_nota, p_event_id, v_points_log_id, p_actor, p_quan
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
      'punts', v_punts, 'esdeveniment', p_event_id
    ) || coalesce(p_detall, '{}'::jsonb)
  );

  return v_id;
end $fn$;

comment on function private.registra_avis(uuid, text, int, int, text, int, uuid, timestamptz, uuid, jsonb) is
  'El cos d''un avis: nota neta, persona, punts, sostre del curs mirat al dia '
  'de l''avis, la fila d''avisos, la de punts i l''auditoria. No mira qui el '
  'crida: ho fan `avisa()` i les RPC dels pendents, que son les portes.';

alter function private.registra_avis(uuid, text, int, int, text, int, uuid, timestamptz, uuid, jsonb) owner to postgres;
revoke all on function private.registra_avis(uuid, text, int, int, text, int, uuid, timestamptz, uuid, jsonb)
  from public, anon, authenticated;

-- ── la porta ───────────────────────────────────────────────────────────────

create or replace function public.avisa(
  p_user_id  uuid,
  p_tipus    text,
  p_nota     text,
  p_punts    int  default 0,
  p_event_id uuid default null,
  p_gravetat int  default null
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
    '{}'::jsonb
  );
end $fn$;

comment on function public.avisa(uuid, text, text, int, uuid, int) is
  'Registra un avis i, si en resta, la fila de punts que el paga. La gravetat '
  'la tria la junta; si arriba a null, mana la del tipus, i l''auditoria guarda '
  'les dues. La resta —nota, sostre, finestra del curs— la fa '
  '`private.registra_avis`, que es el mateix cos que enganxa els avisos pendents.';

alter function public.avisa(uuid, text, text, int, uuid, int) owner to postgres;
revoke all on function public.avisa(uuid, text, text, int, uuid, int) from public, anon;
grant execute on function public.avisa(uuid, text, text, int, uuid, int) to authenticated;

alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'avis',
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
    'hores_persona',
    'retira_avis',
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

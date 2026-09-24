-- La gravetat d'un avís es suggereix pel tipus, però la tria la junta.
--
-- EL QUE HI HAVIA. `avisa()` copiava la gravetat del catàleg i no n'acceptava
-- cap altra. Era la doctrina de la 73 —«es copia en crear la fila i no s'hi
-- torna mai»— aplicada una passa massa lluny: protegia l'avís d'un catàleg que
-- canvia al juny, i de passada impedia que la junta digués que AQUELLA vegada
-- el mateix fet va ser més greu, o menys. Amb pesos i escalons (migració 84),
-- la gravetat ja no és una etiqueta: decideix si algú arriba a risc, i no pot
-- ser una cosa que la junta no pugui decidir.
--
-- EL QUE CANVIA. `avisa()` rep `p_gravetat`. Si arriba a null, mana la del
-- tipus, que és el que feia fins ara i el que fan totes les crides d'avui. El
-- registre d'auditoria guarda les dues —la triada i la suggerida— perquè el
-- dia que algú pregunti per què aquell avís va ser molt greu, quedi escrit que
-- el catàleg deia greu i que la junta va decidir-ho així.
--
-- ═══ PER QUÈ `drop` I NO `create or replace` ═══════════════════════════════
--
-- Un paràmetre nou amb valor per defecte, escrit amb `create or replace`, no
-- reemplaça res: crea una SOBRECÀRREGA al costat de la funció de cinc
-- arguments, i PostgREST contesta PGRST203 a qualsevol crida que no porti el
-- sisè, perquè no sap quina de les dues triar. És el parany que la 81 va
-- esquivar no canviant cap firma. Aquí la firma ha de canviar, o sigui que la
-- vella se'n va primer.
--
-- EL PARÀMETRE NOU VA L'ÚLTIM. `489_els_blancs_...` crida `avisa()` amb quatre
-- arguments posicionals i `tests/rls/policies.test.ts` amb cinc de nom; amb
-- `p_gravetat` al final, totes dues continuen voldre dir el mateix.
--
-- ═══ EL NUCLI SURT D'`avisa()` ═════════════════════════════════════════════
--
-- `private.registra_avis` fa tot el que feia el cos de la 81 —la nota neta, la
-- persona, els punts, el sostre del curs, les dues files i l'auditoria— amb
-- dues coses que abans no eren paràmetres: QUAN va passar (`p_quan`) i QUI el
-- posa (`p_actor`). `avisa()` hi passa `now()` i `auth.uid()`, i per tant fa
-- exactament el que feia.
--
-- EL MOTIU ÉS EL QUE VE DESPRÉS. Els avisos pendents (migracions 87 i 88) són
-- avisos posats a algú que encara no té compte, i quan el compte arriba s'han
-- de convertir en un avís normal DATAT EL DIA DE LA FALTA, amb el mateix sostre
-- i la mateixa auditoria. L'alternativa era una segona còpia del cos d'`avisa()`
-- dins de l'enganxada, i el repositori ja sap què passa amb les còpies: la 77 va
-- trobar la regla del blanc escrita a mà a cinc llocs i equivocada als cinc, i
-- la 78 i la 81 es van haver de trepitjar sobre el mateix cos. Una regla, un
-- lloc.
--
-- LA FINESTRA ES MIRA A `p_quan` I NO A `now()`. Per a `avisa()` és el mateix.
-- Per a un avís datat en el passat, el que compta és si AQUELL dia cau dins del
-- curs: si no hi cau, no hi ha sostre que el fiti, i la 81 ja va decidir que
-- llavors es refusa la resta i no l'avís. El missatge es queda com era, perquè
-- tres fitxers de proves en fixen el text; el que la pantalla llegeix és el
-- HINT, que continua sent `avis_fora_del_curs`.
--
-- I EL TIPUS ACTIU ES MIRA A FORA. `avisa()` només deixa posar tipus actius, que
-- és el que ha de fer un formulari. Un avís pendent, en canvi, es va posar amb
-- un tipus que era actiu aquell dia, i si la junta el retira del catàleg
-- mentrestant, l'enganxada no ha de fallar per això. Qui crida el nucli li
-- passa la gravetat suggerida, o null si el tipus no val per a ell; el nucli
-- refusa el null amb el mateix error de sempre i en el mateix ordre: primer la
-- nota, després el tipus.

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
drop function public.avisa(uuid, text, text, int, uuid);

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

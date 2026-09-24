-- Rollback de la migració 85. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu `p_gravetat` d'`avisa()` i torna la funció al cos sencer de la 81: la
-- gravetat torna a ser la del catàleg i prou, i l'auditoria deixa de guardar la
-- suggerida. `private.registra_avis` se'n va, perquè ja no el crida ningú.
--
-- `drop` I NO `create or replace`, pel mateix motiu que la 85: amb la funció de
-- sis arguments al seu lloc, escriure la de cinc al costat seria una
-- sobrecàrrega, i PostgREST contestaria PGRST203 a qualsevol crida.
--
-- QUÈ TORNA A OBRIR: la junta deixa de poder triar la gravetat d'un avís, i el
-- formulari que la hi envia rebrà PGRST202. Les files ja escrites no es toquen:
-- la gravetat que es va triar es queda a `avisos.gravetat`, que és on ha de ser.

drop function if exists public.avisa(uuid, text, text, int, uuid, int);
drop function if exists private.registra_avis(uuid, text, int, int, text, int, uuid, timestamptz, uuid, jsonb);

create or replace function public.avisa(
  p_user_id  uuid,
  p_tipus    text,
  p_nota     text,
  p_punts    int  default 0,
  p_event_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_id            uuid;
  v_gravetat      int;
  -- La regla del blanc viu a `private.nota_neta` i no aquí: `btrim` d'un sol
  -- argument deixava passar el tabulador i l'espai dur, i amb ells un avis amb
  -- el per que en blanc al perfil de qui el rep.
  v_nota          text := private.nota_neta(coalesce(p_nota, ''));
  v_punts         int  := coalesce(p_punts, 0);
  v_punts_event   uuid;
  v_points_log_id uuid;
  v_sostre        int;
  v_ja            int;
  v_des_de        timestamptz;
  v_fins_a        timestamptz;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if v_nota is null then
    raise exception 'un avis sense motiu escrit no es un avis' using errcode = '22023';
  end if;
  if length(v_nota) > 500 then
    raise exception 'la nota es massa llarga' using errcode = '22023';
  end if;

  select t.gravetat into v_gravetat
    from public.avis_tipus t
   where t.clau = p_tipus and t.actiu;
  if not found then
    raise exception 'tipus d''avis desconegut' using errcode = '22023';
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

  -- El sostre es mira sobre el saldo d'avisos del curs, compensacions incloses:
  -- retirar un avis torna els punts i tambe torna el marge. Les dues files van
  -- amb la data de l'AVIS i no amb la seva propia: la compensatoria s'escriu
  -- amb `now()`, i comptant-la pel seu propi dia, retirar un avis d'un curs
  -- anterior deixava marge aqui que aquest curs no havia gastat mai.
  if v_punts < 0 then
    select pv.punts into v_sostre
      from public.point_values pv
     where pv.mena = 'avisos' and pv.clau = 'sostre_curs';

    if coalesce(v_sostre, 0) > 0 then
      select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

      -- I AVUI HA DE CAURE DINS D'AQUESTA MATEIXA FINESTRA. La fila s'escriu
      -- amb `now()`: si `now()` no hi cau, el gastat que se suma a sota surt
      -- sempre zero i el sostre no fita res —es pot repetir la mateixa resta
      -- indefinidament—. Passa entre cursos, que es quan la junta ja ha escrit
      -- el calendari del setembre i el `global` encara no ha comencat. Sense
      -- finestra no hi ha curs, i sense curs no hi ha sostre que honorar: es
      -- refusa la resta, no l'avis, i amb `p_punts = 0` es registra igual.
      if (v_des_de is not null and now() <  v_des_de)
      or (v_fins_a is not null and now() >= v_fins_a) then
        raise exception 'avui no cau dins de cap curs'
          using errcode = '22023', hint = 'avis_fora_del_curs';
      end if;

      select coalesce(sum(x.puntos), 0)::int into v_ja
        from (
          select pl.puntos,
                 -- Subconsulta i no join: `avisos.points_log_id` no te index
                 -- unic, i un join hi duplicaria la fila el dia que dues files
                 -- apuntessin al mateix moviment.
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

    insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
    values (p_user_id, v_punts_event, 'avis', v_punts, v_nota, (select auth.uid()))
    returning id into v_points_log_id;
  end if;

  insert into public.avisos (user_id, tipus, gravetat, nota, event_id, points_log_id, created_by)
  values (p_user_id, p_tipus, v_gravetat, v_nota, p_event_id, v_points_log_id, (select auth.uid()))
  returning id into v_id;

  -- SENSE LA NOTA A POSTA. `audit_log` es purga als 24 mesos i el llegeix tota
  -- la junta; la nota viu a `avisos`, que es on la pot llegir qui hi surt.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'avis',
    p_user_id,
    jsonb_build_object(
      'avis', v_id, 'tipus', p_tipus, 'gravetat', v_gravetat,
      'punts', v_punts, 'esdeveniment', p_event_id
    )
  );

  return v_id;
end $fn$;

comment on function public.avisa(uuid, text, text, int, uuid) is
  'Registra un avis i, si en resta, la fila de punts que el paga. La nota es '
  'obligatoria i ha de ser una nota que es vegi: ho decideix '
  '`private.nota_neta` i no `btrim`. Copia la gravetat del cataleg en comptes '
  'de resoldre-la per join. Respecta el sostre de punts del curs, que compta '
  'cada moviment pel curs de l''avis que l''explica i no pel de la seva propia '
  'data, i refusa la resta quan avui no cau dins de cap curs, perque llavors '
  'no hi ha sostre que comptar. L''avis es queda amb l''esdeveniment on va '
  'passar encara que la fila de punts no hi pugui anar.';

alter function public.avisa(uuid, text, text, int, uuid) owner to postgres;
revoke all on function public.avisa(uuid, text, text, int, uuid) from public, anon;
grant execute on function public.avisa(uuid, text, text, int, uuid) to authenticated;

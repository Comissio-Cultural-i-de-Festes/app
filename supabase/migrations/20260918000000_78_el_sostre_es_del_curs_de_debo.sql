-- El sostre de punts del curs, comptat pel curs de l'avís i no pel de la seva
-- compensació.
--
-- EL FORAT QUE TAPA. La 73 va deixar `avisa()` mirant el sostre així: suma les
-- files de `points_log` amb motiu `avis` i `avis_retirat` que cauen dins de
-- `private.periode_curs()`. La resta i la seva devolució es cancel·len, que és
-- el que ha de passar —retirar un avís torna els punts i també torna el
-- marge—, però només quan totes dues cauen dins de la mateixa finestra.
--
-- I no hi cauen sempre. `retira_avis()` escriu la compensatòria amb `now()`,
-- una fila d'`avisos` no caduca mai i el botó «Retira l'avís» surt a totes les
-- files vives de la fitxa, siguin del curs que siguin. Retirar un avís de fa
-- dos cursos —una acció normal, no un cas rar— deixava un `+N` DINS d'aquest
-- curs que aquest curs no havia gastat mai, i el sostre que la junta ha escrit
-- passava a valer-ne el doble: amb `sostre_curs = 200`, després d'una retirada
-- de -200 del curs passat hi cabia una resta de -400 d'una sola crida.
--
-- Era l'única protecció que l'issue demanava contra treure punts sense límit a
-- una persona, i tenia una porta que s'obria sola.
--
-- LA CORRECCIÓ: LA DATA QUE MANA ÉS LA DE L'AVÍS. Les dues files —la resta i
-- la seva compensatòria— s'ancoren al `created_at` de l'avís que les explica.
-- Un avís d'aquest curs gasta sostre d'aquest curs i, si es retira, el torna
-- aquí mateix. Un avís d'un curs anterior no gasta ni torna res d'aquest.
--
-- L'ALTRA OPCIÓ, I QUÈ COSTAVA. Es podia arreglar des de `retira_avis()`,
-- escrivint la compensatòria amb la data de l'avís original en comptes de
-- `now()`. Hauria tancat el mateix forat amb una línia, i s'ha descartat: el
-- llibre major és append-only i es llegeix com una cronologia —el perfil el
-- pinta per data— o sigui que una devolució d'avui apareixeria enmig de
-- l'octubre passat, i el rànquing d'un curs tancat canviaria de números mesos
-- després d'acabar. La retirada VA PASSAR avui i la seva fila ho ha de dir. El
-- que no ha de fer és regalar marge, i això es decideix aquí, on es compta.
--
-- L'ÒRFENA COMPTA PEL SEU DIA. Una fila de `points_log` amb motiu `avis` sense
-- cap avís que hi apunti no la pot escriure cap camí de l'aplicació
-- —`award_points` refusa els dos motius i les dues RPC escriuen sempre el
-- parell—, però una migració o una mà a la consola sí. Quan no hi ha avís, la
-- data que mana és la de la pròpia fila: és el que feia la 73 i deixar-la fora
-- del compte seria obrir un forat més gran que el que es tapa.
--
-- CAP FIRMA NO CANVIA i cap fila no es toca: el que canvia és què compta com a
-- gastat abans de deixar passar la crida següent.

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
  v_nota          text := btrim(coalesce(p_nota, ''));
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

  if length(v_nota) = 0 then
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
        raise exception 'sostre de punts del curs' using errcode = '22023';
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
  'obligatoria. Copia la gravetat del cataleg en comptes de resoldre-la per '
  'join, i respecta el sostre de punts del curs, que compta cada moviment pel '
  'curs de l''avis que l''explica i no pel de la seva propia data. L''avis es '
  'queda amb l''esdeveniment on va passar encara que la fila de punts no hi '
  'pugui anar.';

alter function public.avisa(uuid, text, text, int, uuid) owner to postgres;
revoke all on function public.avisa(uuid, text, text, int, uuid) from public, anon;
grant execute on function public.avisa(uuid, text, text, int, uuid) to authenticated;

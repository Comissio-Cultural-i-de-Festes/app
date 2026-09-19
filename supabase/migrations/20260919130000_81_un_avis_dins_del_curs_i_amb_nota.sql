-- Un avís que resta punts ha de caure dins d'un curs, i la seva nota ha de ser
-- una nota.
--
-- DUES COSES I UNA SOLA MIGRACIÓ. Totes dues viuen al cos d'`avisa()`, i dos
-- `create or replace` sobre la mateixa funció el mateix dia és exactament com
-- s'ha arribat al segon defecte d'aquí sota: la 78 va reescriure `avisa()`
-- l'endemà que la 77 creés `private.nota_neta`, sense saber-ho, i es va endur
-- la línia equivocada cap endavant.
--
-- ═══ 1. EL SOSTRE NO FITAVA RES QUAN AVUI CAU FORA DE LA FINESTRA ══════════
--
-- EL FORAT. `avisa()` decideix si deixa passar una resta comparant el sostre
-- del curs amb el que ja s'ha gastat DINS de `private.periode_curs()`. La 78 va
-- arreglar de quin curs és cada moviment —el de l'avís que l'explica i no el de
-- la seva pròpia data— i cap de les dues versions no mira si la fila que està a
-- punt d'escriure hi cau. I no hi cau sempre: `avisa()` escriu amb `now()` i
-- res no obliga que la finestra `global` contingui el dia d'avui.
-- `admin_save_periods` comprova els codis, les menes, els ordres repetits, que
-- un període no acabi abans de començar i que els trimestres vagin seguits, i
-- res més.
--
-- El cas real és un i té nom: la junta prepara el calendari del curs que ve
-- —al juliol, que és quan es prepara— i el `global` passa a començar al
-- setembre. Des d'aquell moment i fins al setembre, cada avís nou s'escriu amb
-- una data que la finestra no cobreix, o sigui que el gastat que `avisa()` suma
-- és sempre zero i el sostre no fita res: es pot repetir la mateixa resta
-- tantes vegades com es vulgui. L'única verja que quedava era l'`abs(punts) >
-- 500` per crida, que és exactament la que l'issue va dir que no bastava.
--
-- (El cas simètric —el curs s'ha acabat i ningú no ha obert el següent— no el
-- pot produir la pantalla, perquè `periodsFromChain` escriu sempre `ends_at:
-- null` al `global`. La condició de sota el cobreix igualment: qui escrigui un
-- final per l'API no ha de descobrir que el sostre deixa de comptar.)
--
-- LA SORTIDA TRIADA: REFUSAR. Si avui no cau dins de cap curs, `avisa()` no
-- deixa restar punts. Es refusa la RESTA, no l'avís: amb `p_punts = 0` es
-- registra igual, i aquest camí és el que la 73 defensa com el primer avís
-- normal —«es pot avisar sense tocar el rànquing»—. I només quan hi ha sostre
-- escrit: amb `sostre_curs = 0` la junta ha dit que no en vol, i no hi ha res a
-- honorar ni, per tant, res a refusar.
--
-- QUÈ COSTA. La junta que treballa al juliol amb el calendari del setembre ja
-- escrit no pot restar punts fins que obri el curs. És una edició a una
-- pantalla que ja té —«Els períodes»— i el missatge de la pantalla ho diu.
--
-- L'ALTRA OPCIÓ I QUÈ COSTAVA: comptar la fila pel seu propi dia, o sigui
-- obrir un segon dipòsit per als moviments que no cauen a cap curs. Deixaria
-- avisar al juliol sense tocar res, i el preu és que aquell dipòsit no el veu
-- ningú: el sostre que fita és un que la junta no ha escrit, `/junta/socis` i
-- la targeta del perfil no el compten —les dues llegeixen per la finestra del
-- curs— i el rànquing tampoc no hi arriba. Uns punts restats que cap pantalla
-- no explica són pitjor que una resta que no es deixa fer i diu per què.
--
-- ═══ 2. I LA NOTA D'UN AVÍS TORNA A SER UNA NOTA ═══════════════════════════
--
-- La 77 enumera `avisa` per escrit com una de les cinc còpies equivocades de la
-- regla del blanc, i en va corregir una —la seva—. La 78 va reescriure aquesta
-- funció l'endemà i es va endur el `length(btrim(coalesce(p_nota,''))) = 0`
-- d'un sol argument: `btrim(text)` treu U+0020 i prou, ni el tabulador, ni
-- l'espai dur, ni l'espai ideogràfic, ni la marca d'ordre de bytes.
--
-- No és cosmètic aquí tampoc. La nota és la meitat del que fa que un avís sigui
-- un avís i no una resta muda: la persona el llegeix al seu perfil amb el motiu
-- escrit, i el formulari de la junta l'hi promet. Amb un tabulador per nota,
-- `avisa()` escriu una fila d'`avisos` i una de `points_log` que al perfil del
-- soci surten com «Avís · −5» amb el per què en blanc. El formulari no hi
-- arriba —`String.prototype.trim()` sí que treu el tabulador— però `avisa()`
-- té el grant per a `authenticated` sencer i es crida amb curl.
--
-- LA REGLA NO ES TORNA A ESCRIURE: es crida `private.nota_neta`, que és per a
-- això que existeix. Queden dues còpies de les cinc que la 77 enumera —l'acta
-- i l'etiqueta d'`avis_tipus`—, i cap de les dues no protegeix punts.
--
-- ═══ 3. I QUE ELS DOS REFUSOS ES PUGUIN LLEGIR ═════════════════════════════
--
-- Els dos refusos del sostre són 22023, que a `errorKey()` cau a la branca de
-- la classe 22 i es tradueix a «No ha sortit bé. Torna-ho a provar d'aquí un
-- moment» — un consell que no pot funcionar mai, perquè tornar-hi torna a
-- passar pel mateix sostre. Els dos porten ara un token estable al camp HINT de
-- l'error, que PostgREST reenvia al cos de la resposta i la pantalla tradueix.
--
-- EL CODI NO CANVIA i el missatge tampoc. Un SQLSTATE propi hauria estat més
-- net, i s'ha descartat: `throws_ok(..., '22023', 'sostre de punts del curs')`
-- és el que asseguren tres fitxers de proves, i el codi d'error d'una RPC és
-- part del seu contracte tant com el nom. El HINT és un camp que aquí no feia
-- servir ningú i que no es llegeix enlloc més.
--
-- CAP FIRMA NO CANVIA: `create or replace` i prou. Un paràmetre nou amb valor
-- per defecte crearia una sobrecàrrega i PostgREST contestaria PGRST203.

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

-- Un avís el proposa una persona de la junta i el valida una altra, ningú no
-- se'n pot posar ni treure un a si mateix, i qui el rep ho sap en el moment.
--
-- EL QUE HI HAVIA. `avisa()` registrava l'avís, restava els punts i el feia
-- comptar per als escalons en la mateixa crida, amb una sola persona al darrere.
-- Ni `avisa()` ni `retira_avis()` ni `edita_mesura_presa()` miraven si la
-- persona afectada era qui feia la crida: algú de la junta es podia retirar el
-- seu propi avís, o escriure-hi la mesura presa que li convingués. I la persona
-- avisada no en sabia res fins que no obria el perfil.
--
-- EL QUE LA JUNTA HA ACORDAT: un avís s'ha de justificar —la nota ja era
-- obligatòria—, l'ha de validar un altre membre de la junta i s'ha de comunicar
-- a la persona quan passa a comptar.
--
-- ═══ PROPOSAT I VALIDAT, A LA MATEIXA TAULA ═══════════════════════════════
--
-- Un avís neix PROPOSAT: és a `avisos`, amb `validat_at` a null, i no té cap
-- fila a `points_log`. Els punts que la junta hi ha escrit es desen a la
-- columna nova `punts` i no es resten fins que un altre membre de la junta el
-- VALIDA. Validar-lo és el que escriu la fila del llibre major —datada el dia
-- de l'avís, com feia `avisa()`— i el que el fa comptar.
--
-- PER QUÈ A LA MATEIXA TAULA I NO EN UNA DE PROPOSTES. L'alternativa era una
-- taula `avisos_proposats` que en validar-se es convertís en una fila
-- d'`avisos`, com fa un avís pendent. Tenia una virtut: cap lectura d'`avisos`
-- no havia de canviar. Costava el doble de tot el que un avís ja porta —la
-- mesura presa editable, el catàleg, la gravetat triada, la retirada amb nota,
-- la política de lectura— i una segona conversió que hauria d'enganxar també
-- els pendents. Amb una columna, el que canvia és QUI COMPTA, i això ja ho
-- decideixen pocs llocs: el sostre i el tauler llegeixen `points_log`, on un
-- proposat no hi és; el comptador del client (`compta()`) i la targeta del
-- perfil, que ara el salten; i la política, que l'amaga al soci.
--
-- QUI NO EL POT VALIDAR: qui l'ha proposat (`created_by`) ni qui el rep. Tots
-- dos amb 42501 i un HINT perquè la pantalla ho digui pel seu nom. Un avís
-- pendent enllaçat porta com a `created_by` qui va escriure el pendent (85, 87),
-- o sigui que tampoc no se'l pot validar ell: la regla és la mateixa pels dos
-- camins sense escriure-la dues vegades.
--
-- EL SOSTRE ES MIRA DUES VEGADES. En proposar, sobre el que ja compta MÉS el
-- que hi ha proposat i viu: dues propostes de -150 amb un sostre de 200 no
-- poden passar totes dues, i és millor dir-ho a qui escriu la segona que no pas
-- a qui la validarà una setmana després. En validar, sobre el que compta i prou,
-- que és la que mana: és el moment en què els punts es resten de debò.
--
-- ═══ RETIRAR I REBUTJAR ══════════════════════════════════════════════════
--
-- `retira_avis()` fa les dues coses i no n'hi ha una tercera RPC. Sobre un avís
-- validat, és la retirada de sempre: fila compensatòria i nota obligatòria.
-- Sobre un proposat, és REBUTJAR-LO: no hi ha res a tornar perquè no s'havia
-- restat res, i la fila es queda tancada amb el motiu escrit. El registre ho
-- separa —`retira_avis` i `rebutja_avis`— perquè són dues decisions diferents.
--
-- RETIRAR NO DEMANA UNA SEGONA PERSONA, i és una decisió. La segona persona hi
-- és per protegir qui rep l'avís d'un càstig que una sola persona ha decidit.
-- Retirar-lo va a favor seu, demana nota, queda al registre i NO el pot fer
-- l'afectat. Exigir-hi dues persones voldria dir un estat més —«retirada
-- proposada»— i una segona cua per a una acció que no fa mal a ningú. Qui ha
-- proposat un avís sí que el pot rebutjar: és retirar la seva pròpia proposta.
--
-- ═══ ELS AVISOS QUE JA EXISTEIXEN ═════════════════════════════════════════
--
-- ES DONEN TOTS PER VALIDATS, amb `validat_at = created_at` i `validat_by` a
-- null. Es van posar quan la regla era una altra i ja compten: tenen la seva
-- fila a `points_log`, que és append-only per disparador. Tornar-los a
-- «proposat» voldria dir escriure una compensatòria per a cadascun i, l'endemà,
-- tornar-los a restar quan algú els validés: el rànquing i els escalons de tota
-- l'associació es mourien dues vegades per un canvi de regla, i la persona
-- avisada rebria una notificació d'una cosa que ja coneix. `validat_by` a null
-- és honest: no els va validar ningú, i la pantalla no s'ho inventa.
--
-- ═══ NINGÚ NO ES TOCA ELS SEUS ═══════════════════════════════════════════
--
-- `avisa()`, `retira_avis()`, `edita_mesura_presa()`, `valida_avis()` i
-- `enllaca_avis_pendent()` refusen amb 42501 i HINT `avis_propi` quan la
-- persona afectada és qui crida. L'enganxada automàtica d'un pendent (88) no
-- crida ningú —la dispara el soci que desa el telèfon— i per això no passa per
-- aquí: si un pendent troba qui el va escriure, en surt un proposat que aquella
-- persona no podrà validar.
--
-- ═══ LA NOTIFICACIÓ ══════════════════════════════════════════════════════
--
-- EN VALIDAR-LO I NO EN PROPOSAR-LO. Un proposat pot ser rebutjat, i avisar
-- algú d'una cosa que potser no existirà és angoixar-lo de franc. A més, el soci
-- no el veuria: la política l'amaga fins que es valida, i l'enllaç de la
-- notificació portaria a un perfil on no hi ha res. Es notifica també quan un
-- avís VALIDAT es retira; rebutjar un proposat no avisa ningú, perquè el soci
-- no en va saber mai res.
--
-- LA INFRAESTRUCTURA ÉS LA DE LA 47, i hi va tal com és: `pg_net`, els dos
-- secrets del vault i l'Edge Function `reveal-push`, que no té cap clau de base
-- de dades i xifra i envia el paquet que li arriba. El paquet d'un avís porta
-- `tipus`, `que` i l'enllaç al perfil, i res més: ni la nota, ni el tipus
-- d'avís, ni la gravetat, ni qui l'ha posat. Una notificació es llegeix a la
-- pantalla bloquejada, on la veu qualsevol que tingui el telèfon a la vista.
--
-- AL MÉS UNA VEGADA I SENSE TOMBAR RES. `net.http_post` encua dins de la
-- transacció: si la validació es desfà, no surt res. I si encuar falla —no hi
-- ha secrets, `pg_net` no hi és, la subscripció és estranya— la validació
-- continua: la notificació és la millora i la targeta del perfil és el camí,
-- que és el que la 47 ja va decidir per a la revelació.
--
-- ═══ L'AUDITORIA ═════════════════════════════════════════════════════════
--
-- Dues accions noves, `valida_avis` i `rebutja_avis`, sense la nota com
-- sempre. La llista sencera del CHECK es reescriu partint de la de la 87, que
-- és l'última de `main`.

-- ── les columnes ───────────────────────────────────────────────────────────
alter table public.avisos
  add column punts      int not null default 0 check (punts between -500 and 0),
  add column validat_at timestamptz,
  add column validat_by uuid references public.profiles (id) on delete set null;

comment on column public.avisos.punts is
  'Els punts que l''avis resta. Mentre es proposat nomes hi son escrits; en '
  'validar-lo es resten amb una fila de `points_log`, que es la que mana.';
comment on column public.avisos.validat_at is
  'Quan un altre membre de la junta el va validar. Null vol dir proposat: no '
  'compta per als escalons, no ha restat punts i el soci no el veu.';
comment on column public.avisos.validat_by is
  'Qui el va validar. Null en un validat vol dir que es d''abans de la 93.';

-- Els d'abans compten tal com són: vegeu la capçalera.
update public.avisos a
   set validat_at = a.created_at,
       punts = coalesce((select pl.puntos from public.points_log pl where pl.id = a.points_log_id), 0);

alter table public.avisos
  -- Un proposat no ha restat res. Si mai hi hagués una fila de punts lligada a
  -- un avís que no compta, el rànquing i els escalons dirien dues coses.
  add constraint avisos_proposat_sense_punts check (validat_at is not null or points_log_id is null),
  add constraint avisos_validat_sencer check (validat_by is null or validat_at is not null);

create index avisos_validat_by_idx on public.avisos (validat_by);

-- ── qui el veu ─────────────────────────────────────────────────────────────
-- El soci, només els seus i només validats. La junta, tots, proposats inclosos:
-- és qui els ha de validar.
drop policy avisos_select_self_or_admin on public.avisos;

create policy avisos_select_self_or_admin on public.avisos
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and validat_at is not null)
    or (select private.is_admin())
  );

-- ── el sostre, en un sol lloc ──────────────────────────────────────────────
-- Fins ara vivia dins del nucli, i ara el demanen dos: proposar i validar.
-- `p_proposats` diu si el que ja s'ha gastat inclou els proposats vius.
create or replace function private.comprova_sostre_avisos(
  p_user_id    uuid,
  p_punts      int,
  p_quan       timestamptz,
  p_proposats  boolean,
  p_excepte    uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_sostre int;
  v_ja     int;
  v_prop   int := 0;
  v_des_de timestamptz;
  v_fins_a timestamptz;
begin
  if coalesce(p_punts, 0) >= 0 then
    return;
  end if;

  select pv.punts into v_sostre
    from public.point_values pv
   where pv.mena = 'avisos' and pv.clau = 'sostre_curs';
  if coalesce(v_sostre, 0) <= 0 then
    return;
  end if;

  select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

  if (v_des_de is not null and p_quan <  v_des_de)
  or (v_fins_a is not null and p_quan >= v_fins_a) then
    raise exception 'avui no cau dins de cap curs'
      using errcode = '22023', hint = 'avis_fora_del_curs';
  end if;

  -- El que ja compta, tal com el va deixar la 81: compensacions incloses, i
  -- cada moviment al curs de l'avís que l'explica.
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

  if p_proposats then
    select coalesce(sum(a.punts), 0)::int into v_prop
      from public.avisos a
     where a.user_id = p_user_id
       and a.validat_at is null
       and a.retirat_at is null
       and a.id is distinct from p_excepte
       and (v_des_de is null or a.created_at >= v_des_de)
       and (v_fins_a is null or a.created_at <  v_fins_a);
  end if;

  if abs(v_ja + v_prop + p_punts) > v_sostre then
    raise exception 'sostre de punts del curs'
      using errcode = '22023', hint = 'avis_sostre';
  end if;
end $fn$;

comment on function private.comprova_sostre_avisos(uuid, int, timestamptz, boolean, uuid) is
  'Refusa una resta que passaria del sostre de punts del curs, mirat al dia de '
  'l''avis. Amb `p_proposats`, compta tambe els proposats vius: es com es mira '
  'en proposar. Sense, nomes el que ja compta: es com es mira en validar.';

alter function private.comprova_sostre_avisos(uuid, int, timestamptz, boolean, uuid) owner to postgres;
revoke all on function private.comprova_sostre_avisos(uuid, int, timestamptz, boolean, uuid)
  from public, anon, authenticated;

-- ── el nucli: ara proposa ──────────────────────────────────────────────────
-- LA MATEIXA FIRMA QUE A LA 86, i per tant `create or replace`: `avisa()` i
-- `private.enganxa_pendent` el continuen cridant igual. El que canvia és que ja
-- no escriu a `points_log`: desa els punts a la fila i deixa l'avís proposat.
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
  v_id     uuid;
  v_nota   text := private.nota_neta(coalesce(p_nota, ''));
  v_mesura text := private.nota_neta(coalesce(p_mesura_presa, ''));
  v_punts  int  := coalesce(p_punts, 0);
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

  perform private.comprova_sostre_avisos(p_user_id, v_punts, p_quan, true, null);

  insert into public.avisos (
    user_id, tipus, gravetat, nota, mesura_presa, event_id, punts, created_by, created_at
  )
  values (
    p_user_id, p_tipus, p_gravetat, v_nota, v_mesura, p_event_id, v_punts, p_actor, p_quan
  )
  returning id into v_id;

  -- SENSE LA NOTA A POSTA, com a la 73. `avis` vol dir ara que s'ha proposat;
  -- que compta ho diu `valida_avis`.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    p_actor,
    'avis',
    p_user_id,
    jsonb_build_object(
      'avis', v_id, 'tipus', p_tipus,
      'gravetat', p_gravetat, 'gravetat_suggerida', p_gravetat_suggerida,
      'punts', v_punts, 'esdeveniment', p_event_id,
      'amb_mesura', v_mesura is not null,
      'proposat', true
    ) || coalesce(p_detall, '{}'::jsonb)
  );

  return v_id;
end $fn$;

comment on function private.registra_avis(uuid, text, int, int, text, int, uuid, timestamptz, uuid, jsonb, text) is
  'Proposa un avis: nota neta, mesura presa, persona, punts, sostre del curs '
  'comptant els proposats vius, la fila d''avisos i l''auditoria. No escriu a '
  '`points_log`: ho fa `private.compta_avis` quan algu altre el valida. No mira '
  'qui el crida: ho fan `avisa()` i les RPC dels pendents, que son les portes.';

-- ── la notificació ─────────────────────────────────────────────────────────
-- `p_que` és `nou` o `retirat`. Mai la nota ni res de l'avís: vegeu la
-- capçalera. Torna si s'ha encuat, perquè les proves ho puguin mirar.
create or replace function private.avisa_push(p_user_id uuid, p_que text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_url   text;
  v_token text;
  v_subs  jsonb;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'reveal_push_url';
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'reveal_push_token';
    if v_url is null or v_token is null then
      return false;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
      into v_subs
      from public.push_subscription s
     where s.user_id = p_user_id;
    if jsonb_array_length(v_subs) = 0 then
      return false;
    end if;

    perform net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'tipus', 'avis',
        'que', p_que,
        'url', '/perfil',
        'subscripcions', v_subs
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reveal-token', v_token
      )
    );
    return true;
  exception when others then
    -- Callar aquí és a posta: una notificació que no surt no pot desfer la
    -- validació d'un avís. El camí és la targeta del perfil.
    return false;
  end;
end $fn$;

comment on function private.avisa_push(uuid, text) is
  'Encua la notificacio d''un avis nou o retirat per a les subscripcions de la '
  'persona, per la mateixa Edge Function que la revelacio. Sense la nota. No '
  'falla mai: sense secrets, sense subscripcions o amb `pg_net` caigut, torna '
  'false i prou.';

alter function private.avisa_push(uuid, text) owner to postgres;
revoke all on function private.avisa_push(uuid, text) from public, anon, authenticated;

-- ── validar: el que el fa comptar ──────────────────────────────────────────
-- El nucli, sense mirar qui crida: ho fa `valida_avis()`. Viu a part perquè les
-- proves dels altres fitxers puguin validar el que proposen sense haver de fer
-- de tres persones; la porta i les seves regles es proven a la 498.
create or replace function private.compta_avis(p_avis_id uuid, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_avis          public.avisos%rowtype;
  v_punts_event   uuid;
  v_points_log_id uuid;
begin
  select * into v_avis from public.avisos where id = p_avis_id for update;
  if not found then
    raise exception 'aquest avis no existeix' using errcode = '22023';
  end if;
  if v_avis.validat_at is not null or v_avis.retirat_at is not null then
    raise exception 'aquest avis ja no espera validacio'
      using errcode = '22023', hint = 'avis_ja_resolt';
  end if;

  -- El que mana: el que ja compta, sense els altres proposats.
  perform private.comprova_sostre_avisos(v_avis.user_id, v_avis.punts, v_avis.created_at, false, null);

  if v_avis.punts <> 0 then
    v_punts_event := v_avis.event_id;
    if v_punts_event is not null and exists (
      select 1 from public.events e where e.id = v_punts_event and e.abast = 'junta'
    ) then
      v_punts_event := null;
    end if;

    -- Amb la data de l'avís, com feia el nucli fins ara: el rànquing llegeix
    -- `coalesce(e.starts_at, pl.created_at)`, i un avís del 14 d'octubre que
    -- es valida el 20 ha de restar al trimestre del 14. `granted_by` és qui el
    -- va proposar, que és qui va decidir els punts.
    insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by, created_at)
    values (v_avis.user_id, v_punts_event, 'avis', v_avis.punts, v_avis.nota,
            v_avis.created_by, v_avis.created_at)
    returning id into v_points_log_id;
  end if;

  update public.avisos
     set validat_at = now(),
         validat_by = p_actor,
         points_log_id = v_points_log_id
   where id = p_avis_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    p_actor,
    'valida_avis',
    v_avis.user_id,
    jsonb_build_object('avis', p_avis_id, 'punts', v_avis.punts, 'proposat_per', v_avis.created_by)
  );

  perform private.avisa_push(v_avis.user_id, 'nou');
end $fn$;

comment on function private.compta_avis(uuid, uuid) is
  'Valida un avis proposat: sostre del curs, la fila de `points_log` datada el '
  'dia de l''avis, `validat_at`, l''auditoria i la notificacio. No mira qui el '
  'crida: ho fa `valida_avis()`.';

alter function private.compta_avis(uuid, uuid) owner to postgres;
revoke all on function private.compta_avis(uuid, uuid) from public, anon, authenticated;

create or replace function public.valida_avis(p_avis_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_user uuid;
  v_by   uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select a.user_id, a.created_by into v_user, v_by
    from public.avisos a where a.id = p_avis_id;
  if not found then
    raise exception 'aquest avis no existeix' using errcode = '22023';
  end if;

  if v_user = (select auth.uid()) then
    raise exception 'ningu no es pot tocar els seus propis avisos'
      using errcode = '42501', hint = 'avis_propi';
  end if;
  if v_by = (select auth.uid()) then
    raise exception 'un avis el valida algu que no l''ha proposat'
      using errcode = '42501', hint = 'avis_validacio_propia';
  end if;

  perform private.compta_avis(p_avis_id, (select auth.uid()));
end $fn$;

comment on function public.valida_avis(uuid) is
  'Valida un avis proposat i el fa comptar: resta els punts i avisa la persona. '
  'Nomes la junta, i ni qui l''ha proposat ni qui el rep. Auditat.';

alter function public.valida_avis(uuid) owner to postgres;
revoke all on function public.valida_avis(uuid) from public, anon;
grant execute on function public.valida_avis(uuid) to authenticated;

-- ── proposar ───────────────────────────────────────────────────────────────
-- La mateixa firma que la 86. L'única línia nova és la de l'autoavís.
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

  if p_user_id = (select auth.uid()) then
    raise exception 'ningu no es pot tocar els seus propis avisos'
      using errcode = '42501', hint = 'avis_propi';
  end if;

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

comment on function public.avisa(uuid, text, text, int, uuid, int, text) is
  'Proposa un avis. No compta ni resta punts fins que un altre membre de la '
  'junta el valida amb `valida_avis()`. Ningu no se''n pot proposar un a si '
  'mateix. La resta —nota, gravetat, sostre, finestra del curs— la fa '
  '`private.registra_avis`, que es el mateix cos que enganxa els avisos pendents.';

-- ── retirar, o rebutjar el que encara no compta ────────────────────────────
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
  -- `private.nota_neta` i no el `btrim` de la 73, ara que el cos es torna a
  -- escriure: és la regla del blanc que la 77 va tancar en una funció, i un
  -- tabulador no és un motiu.
  v_nota   text := private.nota_neta(coalesce(p_nota, ''));
  v_comp   uuid;
  v_valid  boolean;
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

  if v_avis.user_id = (select auth.uid()) then
    raise exception 'ningu no es pot tocar els seus propis avisos'
      using errcode = '42501', hint = 'avis_propi';
  end if;

  if v_avis.retirat_at is not null then
    raise exception 'aquest avis ja esta retirat' using errcode = '22023';
  end if;

  v_valid := v_avis.validat_at is not null;

  -- Un proposat no té punts restats i per tant no té res a tornar.
  if v_valid and v_avis.points_log_id is not null then
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
    case when v_valid then 'retira_avis' else 'rebutja_avis' end,
    v_avis.user_id,
    jsonb_build_object('avis', p_avis_id, 'punts', coalesce(-v_punts, 0))
  );

  if v_valid then
    perform private.avisa_push(v_avis.user_id, 'retirat');
  end if;
end $fn$;

comment on function public.retira_avis(uuid, text) is
  'Retira un avis validat i torna els punts amb una fila compensatoria, o '
  'rebutja un de proposat, que no en te cap per tornar. Nota obligatoria. Ningu '
  'no es pot retirar els seus. Un avis ja retirat no es pot tornar a retirar.';

-- ── la mesura presa ────────────────────────────────────────────────────────
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

  if v_avis.user_id = (select auth.uid()) then
    raise exception 'ningu no es pot tocar els seus propis avisos'
      using errcode = '42501', hint = 'avis_propi';
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

-- ── enllaçar un pendent a mà ───────────────────────────────────────────────
-- Enllaçar-se'l a si mateix seria proposar-se un avís per la porta del costat.
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

  if p_user_id = (select auth.uid()) then
    raise exception 'ningu no es pot tocar els seus propis avisos'
      using errcode = '42501', hint = 'avis_propi';
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

comment on function public.enllaca_avis_pendent(uuid, uuid) is
  'Converteix a ma un avis pendent en un avis PROPOSAT de `p_user_id`, datat el '
  'dia de la falta. Nomes la junta, i ningu no se l''enllaca a si mateix. Els '
  'refusos del nucli (sostre, persona) pugen. Auditat.';

-- ── i les dues accions noves al registre ───────────────────────────────────
-- La llista sencera, partint de la de la 87: la migració més nova que la
-- declara la porta tota.
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
    'rebutja_avis',
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
    'valida_avis',
    'visa_hores'
  ));

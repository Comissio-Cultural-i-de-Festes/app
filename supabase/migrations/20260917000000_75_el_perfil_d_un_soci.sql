-- El perfil d'un soci, vist per un altre soci.
--
-- PER QUÈ EXISTEIX. L'app ensenya la cara i el nom d'altra gent a cinc llocs
-- —el rànquing, qui hi ha dins, els cotxes, les idees i la tira d'insígnies— i
-- cap d'aquells noms porta enlloc. Qui entra al setembre es passa el primer
-- trimestre posant noms a cares. La meitat del que caldria per contestar «qui
-- és aquesta persona» ja és llegible: `profiles` publica tota fila activa i
-- `att_select_public_si` publica a què ha vingut. Aquest fitxer només hi afegeix
-- les altres dues meitats, que viuen en taules tancades i necessiten el mateix
-- embolcall `definer` que el rànquing fa servir per publicar sumes sobre
-- `points_log`.
--
-- FALTA L'EMBOLCALL, NO EL CÀLCUL. `private.streak_rows(p_user)` ja rep la
-- persona per paràmetre des de la migració 37, i el tauler de junta ja la crida
-- per a altra gent. El que no existia és una porta pública amb un argument. El
-- bucle que compta la ratxa vivia dins de `my_streak()`, o sigui dins de la
-- porta; aquí baixa a `private.streak_of()` i les dues portes —la teva i la
-- d'un altre— queden sent el que haurien estat sempre: una comprovació de qui
-- truca i una crida. Duplicar el bucle hauria volgut dir que el dia que algú
-- canviï què trenca una ratxa, la teva i la d'un altre deixin de dir el mateix.
--
-- `member_badges()` ÉS NOMÉS DE LECTURA, I NO ÉS EVIDENT. `my_badges()`
-- reparteix les insígnies que toquin abans de tornar res: és el que la fa
-- retroactiva, i està documentat en majúscules des de la migració 37. Una
-- versió per a una altra persona que cridés `private.grant_badges()` voldria
-- dir que OBRIR EL PERFIL D'ALGÚ LI REGALA INSÍGNIES, i que qui les guanya
-- depèn de qui el mira. Per això aquesta és `stable` i no `volatile`: la
-- declaració és la barrera, perquè un `perform private.grant_badges(...)` dins
-- d'una funció `stable` peta en comptes de passar desapercebut.
--
-- QUI JA NO HI ÉS NO TÉ PERFIL, I NO ÉS UN ERROR. `profiles_select_directory`
-- només publica `estat = 'actiu'`, o sigui que la capçalera de la pantalla ja
-- torna zero files per a algú de baixa. Les dues funcions d'aquí diuen el
-- mateix —null i cap fila— en comptes de petar: la pantalla ja sap dir «aquest
-- soci ja no hi és», i tres errors a sota seria dir-ho tres vegades més amb
-- lletra vermella.
--
-- EL QUE NO HI HA. Cap funció que torni punts d'una altra persona. El total i
-- la posició ja els dóna `ranking_period()`, que la pantalla del rànquing ja
-- es baixa, i el desglossament per motiu no hi va: ensenyar «muntatge: 3
-- vegades» d'un altre és més del que ensenya el rànquing, que només publica el
-- total. I sobretot, la `nota` d'un ajust manual no pot sortir d'enlloc
-- d'aquí —el motiu pel qual la junta va treure punts a algú és per a aquella
-- persona i per a la junta. `points_log` es queda tancat, i per això no hi ha
-- cap funció nova que el toqui.

-- ── el recompte de la ratxa, separat de qui la demana ───────────────────────
-- Literalment el bucle que hi havia a `my_streak()`, amb `auth.uid()` canviat
-- per un paràmetre. Cap regla nova: les que decideixen quines activitats
-- compten continuen totes a `private.streak_rows()`, que és on es discuteixen.
create or replace function private.streak_of(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  r          record;
  v_run      int := 0;
  v_actual   int := 0;
  v_millor   int := 0;
  v_perduda  int := 0;
  v_trencada timestamptz;
  v_compten  int := 0;
  v_hi_vas   int := 0;
begin
  for r in select * from private.streak_rows(p_user) loop
    v_compten := v_compten + 1;
    if r.hi_va_anar then
      v_run := v_run + 1;
      v_hi_vas := v_hi_vas + 1;
      if v_run > v_millor then v_millor := v_run; end if;
    else
      -- Només es guarda el que s'ha trencat si hi havia alguna cosa a trencar:
      -- «has perdut una ratxa de zero» és renyar algú per no haver vingut mai.
      if v_run > 0 then
        v_perduda  := v_run;
        v_trencada := r.starts_at;
      end if;
      v_run := 0;
    end if;
  end loop;

  v_actual := v_run;

  -- Amb una ratxa viva no hi ha res de trencat a explicar. Ensenyar totes dues
  -- coses alhora faria que la pantalla renyés i felicités a la vegada.
  if v_actual > 0 then
    v_perduda  := 0;
    v_trencada := null;
  end if;

  return jsonb_build_object(
    'actual',      v_actual,
    'millor',      v_millor,
    'perduda',     v_perduda,
    'trencada_el', v_trencada,
    'compten',     v_compten,
    'hi_has_anat', v_hi_vas
  );
end $fn$;

alter function private.streak_of(uuid) owner to postgres;
revoke all on function private.streak_of(uuid) from public, anon, authenticated;

comment on function private.streak_of(uuid) is
  'El recompte de la ratxa d''una persona, sense preguntar qui el demana. No '
  'te cap porta: les dues que hi ha —my_streak() i member_streak()— son les '
  'que comproven qui truca. Aixi el bucle viu una sola vegada i la teva ratxa i '
  'la d''un altre no poden dir coses diferents.';

-- ── la teva, que ara és l'embolcall que sempre hauria d'haver estat ─────────
create or replace function public.my_streak()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  return private.streak_of((select auth.uid()));
end $fn$;

alter function public.my_streak() owner to postgres;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated, service_role;

comment on function public.my_streak() is
  'La teva ratxa: `actual`, `millor`, i si s''ha trencat, quant valia i quan. '
  'Es calcula sempre, mai es desa. No diu res de si esta «en perill»: aixo '
  'depen de si hi ha una activitat oberta, cosa que la pantalla ja sap. El '
  'recompte es a private.streak_of() des de la migracio 75.';

-- ── i la d'un altre ────────────────────────────────────────────────────────
-- Torna null en comptes de petar quan la persona ja no és sòcia. Vegeu el
-- capçal: la pantalla ja ho diu una vegada amb la capçalera buida, i aquesta és
-- la segona de tres que hi hauria si totes tres petessin.
create or replace function public.member_streak(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_user and p.estat = 'actiu'
  ) then
    return null;
  end if;

  return private.streak_of(p_user);
end $fn$;

alter function public.member_streak(uuid) owner to postgres;
revoke all on function public.member_streak(uuid) from public, anon;
grant execute on function public.member_streak(uuid) to authenticated, service_role;

comment on function public.member_streak(uuid) is
  'La ratxa d''un altre soci, amb la mateixa forma que my_streak(). Definer '
  'perque el calcul mira `attendances` d''una altra persona; la porta es que '
  'qui truca sigui soci actiu i que qui es demana tambe ho sigui. Amb algu de '
  'baixa torna null, que es el que la capcalera de la pantalla ja diu.';

-- ── les insígnies d'un altre ───────────────────────────────────────────────
-- `stable`, i és la part important de la signatura. Vegeu el capçal.
--
-- SENSE `nova`. Aquella columna és «encara no te l'has mirada», que és una cosa
-- teva i d'aquesta pantalla no. Treure-la també vol dir que no hi ha cap
-- manera d'arribar a `mark_badges_seen()` des d'aquí per accident.
--
-- EL TÍTOL DE L'ACTIVITAT PASSA PER LA MATEIXA TANCA QUE `event_title`. Gairebé
-- totes les insígnies venen d'una activitat a què la persona va anar, i una
-- activitat a què algú ja ha anat fa temps que està revelada. `va_ser_idea_meva`
-- no: apunta a l'esdeveniment d'una proposta acceptada, que pot ser una festa
-- de d'aquí a un mes amb el nom encara amagat. Sense aquest `case`, el perfil
-- de qui va tenir la idea seria la manera de llegir-lo abans d'hora.
-- PLPGSQL I NO SQL, PER PODER PETAR. `badge_holders()` filtra en silenci amb
-- `is_active_member()` dins del `where`, i per a una suma està bé. Aquí no: qui
-- encara espera l'alta rebria una ratxa amb un 42501 i una graella d'insígnies
-- buida a la mateixa pantalla, o sigui dues respostes diferents a la mateixa
-- pregunta. Les tres portes d'aquest fitxer contesten igual.
create or replace function public.member_badges(p_user uuid)
returns table (codi text, earned_at timestamptz, event_id uuid, titol text, starts_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  return query
    select
      b.codi,
      b.earned_at,
      b.event_id,
      case when v.es_visible then t.titulo end,
      case when v.es_visible then e.starts_at end
    from public.badges b
    join public.profiles p on p.id = b.user_id
    left join public.events e on e.id = b.event_id
    left join public.event_title t on t.event_id = e.id
    cross join lateral (
      select b.event_id is not null
         and private.event_is_revealed(b.event_id)
         and not private.event_is_junta_only(b.event_id) as es_visible
    ) v
    where b.user_id = p_user
      and p.estat = 'actiu'
    order by b.earned_at desc, b.codi;
end $fn$;

alter function public.member_badges(uuid) owner to postgres;
revoke all on function public.member_badges(uuid) from public, anon;
grant execute on function public.member_badges(uuid) to authenticated, service_role;

comment on function public.member_badges(uuid) is
  'Les insignies d''un altre soci, i NOMES llegir-les: a diferencia de '
  'my_badges() no reparteix res, perque obrir el perfil d''algu no li ha de '
  'regalar cap insignia. Es `stable` a posta, que es el que fa que un '
  'grant_badges() afegit aqui algun dia peti en comptes de passar. Amb algu de '
  'baixa no torna cap fila.';

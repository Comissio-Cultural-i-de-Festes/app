-- Els avisos pendents: un avís per a algú que encara no té compte.
--
-- EL FORAT. Als esdeveniments hi ve gent que encara no és a l'app —s'apunta
-- per un formulari o la porta algú— i de qui la junta només té el nom i el
-- telèfon. Si aquella persona no es presenta al muntatge que havia dit que
-- faria, avui no hi ha on escriure-ho: `avisa()` demana un perfil. I quan
-- s'acabi fent el compte, tres setmanes després, ningú no se'n recordarà.
--
-- UNA TAULA A PART I NO UN PERFIL FANTASMA. L'alternativa era crear un
-- `profiles` sense `auth.users` al darrere i posar-li l'avís. Costava trencar
-- la regla de la 00 —cada perfil és una persona que ha entrat— i, sobretot,
-- fusionar després el fantasma amb el compte de debò, que és una operació que
-- toca totes les taules que referencien `profiles`. Aquí el pendent és un avís
-- que espera, i quan troba la persona es converteix en un avís normal amb
-- `private.registra_avis`, el mateix cos que fa servir `avisa()`.
--
-- ═══ EL TELÈFON, I PER QUÈ NOMÉS NOU DÍGITS ════════════════════════════════
--
-- La junta l'escriu com el té —«612 34 56 78»— i el soci el posa a l'onboarding
-- com vol —«+34612345678»—. `looksLikePhone` no normalitza res a posta (vegeu
-- `onboarding/api.ts`), o sigui que la comparació ha de ser tolerant. Els nou
-- últims dígits són el número nacional sencer a Espanya i treuen el prefix de
-- país, els espais i els guions. El preu, dit: dos números de països diferents
-- amb els mateixos nou últims dígits coincidirien. En una associació d'una
-- universitat és improbable, i quan passi l'enganxada no ho fa sola si hi ha
-- dos perfils (vegeu la 88): surt com a ambigu i ho decideix la junta.
--
-- `telefon_9` ÉS UNA COLUMNA GENERADA i no un càlcul a cada consulta, perquè
-- la regla ha de ser una: la mateixa `private.darrers_9` que la 88 aplica a
-- `profile_contact.telefon`.
--
-- ═══ DADES PERSONALS: QUÈ ES GUARDA I FINS QUAN ═══════════════════════════
--
-- El nom i el telèfon d'algú que NO és soci són dades d'una persona que no ha
-- acceptat res. Es guarden el temps just:
--
--   EN RESOLDRE'S, EL TELÈFON SE'N VA. Quan el pendent s'enllaça, `avis_id`
--   ja diu de qui és; quan es retira, ja no s'ha de buscar ningú. En tots dos
--   casos `telefon` passa a null —i amb ell `telefon_9`— dins de la mateixa
--   sentència que el resol. Un CHECK de la taula ho fa invariant: un pendent
--   té telèfon si i només si encara espera.
--
--   ELS QUE NO S'HAN ENLLAÇAT, ES PURGUEN EN TANCAR EL CURS. Un pendent del
--   curs passat que no ha trobat ningú no trobarà ningú: la persona no s'ha fet
--   soci. I un de retirat ja no s'ha de trobar: només hi queden el nom i la
--   nota d'algú que no té compte. Cada nit, `private.purga_avis_pendents()`
--   esborra els que esperen i els retirats amb la falta anterior al començament
--   del curs actual, si aquest curs ja ha començat. El nom només es queda als
--   ENLLAÇATS, i fins i tot allà el que compta és `avis_id`: l'avís viu a
--   `avisos`, que és on el llegeix qui hi surt.
--
--   L'AUDITORIA NO PORTA NI EL NOM NI EL TELÈFON, per la raó de sempre:
--   `audit_log` es purga als 24 mesos, no quan es tanca el curs.
--
-- ═══ QUI HI ARRIBA ════════════════════════════════════════════════════════
--
-- Només la junta la llegeix, per RLS. Cap grant d'escriptura per a
-- `authenticated`: tot entra per les tres RPC d'aquí sota, que són `security
-- definer`, miren `is_admin()` i auditen. El que un soci no ha de poder fer és
-- un grant que falta, no una política que falta.
--
-- ═══ LA DATA DE LA FALTA ══════════════════════════════════════════════════
--
-- `falta_at` és un instant i no una data: el client hi envia la mitjanit local
-- del dia triat, i així a la base no hi ha cap zona horària escrita —la zona és
-- de `src/config`, com tot el que és d'aquesta associació—. No pot ser futura, i
-- ho comprova la RPC i no un CHECK, perquè un CHECK amb `now()` es reavalua a
-- cada UPDATE i faria petar la resolució d'un pendent que era vàlid el dia que
-- es va crear.
--
-- Quan s'enganxa, l'avís i la seva fila de punts porten AQUESTA data i no la
-- del dia que es va fer el compte: la 85 va treure la data a un paràmetre del
-- nucli exactament per això. Així compta al curs i al trimestre de la falta,
-- com un avís posat aquell mateix dia.
--
-- SI LA FALTA JA CAU FORA DEL CURS i el pendent resta punts amb un sostre
-- escrit, es refusa en crear-lo i no en enganxar-lo: la 81 va decidir que fora
-- de cap curs no hi ha sostre que honorar i es refusa la resta, i dir-ho ara és
-- millor que un pendent que quedarà bloquejat per sempre. Si la finestra canvia
-- més tard, l'enganxada el deixa esperant amb el motiu escrit.

-- ── els nou dígits ─────────────────────────────────────────────────────────
create or replace function private.darrers_9(p_telefon text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case when length(d) >= 9 then right(d, 9) end
    from (select regexp_replace(p_telefon, '[^0-9]', '', 'g') as d) x
$$;

comment on function private.darrers_9(text) is
  'Els nou ultims digits d''un telefon, o null si en te menys de nou. La regla '
  'amb que un avis pendent troba el perfil que li toca.';

revoke all on function private.darrers_9(text) from public, anon, authenticated;

-- ── la taula ───────────────────────────────────────────────────────────────
create table public.avisos_pendents (
  id                 uuid primary key default gen_random_uuid(),
  -- Per reconèixer la persona, i prou. Net, com la nota.
  nom                text not null
                     check (length(nom) between 1 and 80 and private.nota_neta(nom) = nom),
  -- Tal com es va escriure, i només mentre espera.
  telefon            text
                     check (telefon is null
                            or length(regexp_replace(telefon, '[^0-9]', '', 'g')) between 9 and 15),
  telefon_9          text generated always as (private.darrers_9(telefon)) stored,
  -- L'avís que serà, amb les mateixes regles que `avisos`.
  tipus              text not null references public.avis_tipus (clau),
  gravetat           int  not null check (gravetat between 1 and 3),
  gravetat_suggerida int  not null check (gravetat_suggerida between 1 and 3),
  punts              int  not null default 0 check (punts between -500 and 0),
  nota               text not null
                     check (length(nota) between 1 and 500 and private.nota_neta(nota) = nota),
  mesura_presa       text
                     check (mesura_presa is null
                            or (length(mesura_presa) between 1 and 500
                                and private.nota_neta(mesura_presa) = mesura_presa)),
  falta_at           timestamptz not null,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  -- Enllaçat: amb quin avís, quan, com, i qui si va ser a mà.
  avis_id            uuid references public.avisos (id) on delete set null,
  enllacat_at        timestamptz,
  enllacat_via       text check (enllacat_via in ('telefon', 'ma')),
  enllacat_by        uuid references public.profiles (id) on delete set null,
  -- El darrer motiu pel qual no s'ha pogut enganxar sol. `ambigu` és que hi ha
  -- més d'un perfil actiu amb aquell telèfon; els altres són els HINT del
  -- nucli, i `error` qualsevol altra cosa (amb el SQLSTATE al costat).
  motiu              text check (motiu in ('ambigu', 'avis_sostre', 'avis_fora_del_curs', 'error')),
  motiu_codi         text,
  retirat_at         timestamptz,
  retirat_by         uuid references public.profiles (id) on delete set null,
  retirat_nota       text check (retirat_nota is null or length(btrim(retirat_nota)) between 1 and 500),

  constraint avisos_pendents_enllacat_sencer check (
    (enllacat_at is null and enllacat_via is null and enllacat_by is null)
    or (enllacat_at is not null and enllacat_via is not null)
  ),
  constraint avisos_pendents_retirat_sencer check (
    (retirat_at is null and retirat_by is null and retirat_nota is null)
    or (retirat_at is not null and retirat_nota is not null)
  ),
  constraint avisos_pendents_un_sol_final check (enllacat_at is null or retirat_at is null),
  -- LA INVARIANT DE LES DADES PERSONALS: té telèfon si i només si encara
  -- espera. Resoldre'l sense esborrar-lo peta aquí.
  constraint avisos_pendents_telefon_mentre_espera check (
    (enllacat_at is null and retirat_at is null) = (telefon is not null)
  )
);

comment on table public.avisos_pendents is
  'Avisos per a algu que encara no te compte, identificat pel nom i el telefon. '
  'Nomes la junta la llegeix; nomes s''hi escriu per RPC. Quan un perfil actiu '
  'te els mateixos nou ultims digits, el pendent es converteix en un avis normal '
  'datat el dia de la falta. DADES PERSONALS: el telefon s''esborra en enllacar '
  'o retirar el pendent, i els no enllacats (els que esperen i els retirats) es '
  'purguen cada nit un cop el curs de la falta s''ha tancat.';

alter table public.avisos_pendents enable row level security;

create policy avisos_pendents_select_admin on public.avisos_pendents
  for select to authenticated
  using ((select private.is_admin()));

revoke all on public.avisos_pendents from anon, authenticated;
grant select on public.avisos_pendents to authenticated;
grant select, insert, update, delete on public.avisos_pendents to service_role;

-- El que la 88 busca: els que esperen, pels seus dígits.
create index avisos_pendents_esperen_idx on public.avisos_pendents (telefon_9)
  where enllacat_at is null and retirat_at is null;
-- I els de les claus foranes, pel camí de borrat, com a la 73.
create index avisos_pendents_tipus_idx       on public.avisos_pendents (tipus);
create index avisos_pendents_avis_idx        on public.avisos_pendents (avis_id);
create index avisos_pendents_created_by_idx  on public.avisos_pendents (created_by);
create index avisos_pendents_enllacat_by_idx on public.avisos_pendents (enllacat_by);
create index avisos_pendents_retirat_by_idx  on public.avisos_pendents (retirat_by);

-- ── convertir-ne un en avís ─────────────────────────────────────────────────
-- EL MATEIX NUCLI QUE `avisa()`, amb la data de la falta i el creador del
-- pendent com a autor: qui va decidir l'avís és qui el va escriure, no qui el
-- rep ni qui l'enllaça. La nota, la persona, el sostre del curs de la falta i
-- l'auditoria `avis` són les de sempre; el `detall` hi afegeix de quin pendent
-- ve i per quin camí.
--
-- No mira qui la crida ni si el pendent espera: ho fan les dues portes —la RPC
-- d'enllaç manual i l'enganxada de la 88—, que tenen la fila bloquejada.
create or replace function private.enganxa_pendent(p_id uuid, p_user_id uuid, p_via text, p_by uuid)
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
  select * into v_p from public.avisos_pendents where id = p_id;

  v_avis := private.registra_avis(
    p_user_id,
    v_p.tipus,
    v_p.gravetat,
    v_p.gravetat_suggerida,
    v_p.nota,
    v_p.punts,
    null,
    v_p.falta_at,
    v_p.created_by,
    jsonb_build_object('pendent', v_p.id, 'via', p_via),
    v_p.mesura_presa
  );

  -- I el telèfon se'n va en la mateixa sentència que el resol: n'hi ha prou
  -- amb `avis_id` per saber de qui era.
  update public.avisos_pendents
     set avis_id = v_avis,
         enllacat_at = now(),
         enllacat_via = p_via,
         enllacat_by = p_by,
         motiu = null,
         motiu_codi = null,
         telefon = null
   where id = p_id;

  return v_avis;
end $fn$;

comment on function private.enganxa_pendent(uuid, uuid, text, uuid) is
  'Converteix un avis pendent en un avis de `p_user_id`, datat el dia de la '
  'falta, i en treu el telefon. No comprova permisos ni estat: ho fan qui la '
  'criden.';

alter function private.enganxa_pendent(uuid, uuid, text, uuid) owner to postgres;
revoke all on function private.enganxa_pendent(uuid, uuid, text, uuid) from public, anon, authenticated;

-- ── crear-ne un ────────────────────────────────────────────────────────────
create or replace function public.crea_avis_pendent(
  p_nom          text,
  p_telefon      text,
  p_falta_at     timestamptz,
  p_tipus        text,
  p_nota         text,
  p_punts        int  default 0,
  p_gravetat     int  default null,
  p_mesura_presa text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_id        uuid;
  v_nom       text := private.nota_neta(coalesce(p_nom, ''));
  v_nota      text := private.nota_neta(coalesce(p_nota, ''));
  v_mesura    text := private.nota_neta(coalesce(p_mesura_presa, ''));
  v_digits    int  := length(regexp_replace(coalesce(p_telefon, ''), '[^0-9]', '', 'g'));
  v_punts     int  := coalesce(p_punts, 0);
  v_suggerida int;
  v_gravetat  int;
  v_sostre    int;
  v_des_de    timestamptz;
  v_fins_a    timestamptz;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if v_nom is null then
    raise exception 'sense nom no es pot reconeixer ningu' using errcode = '22023';
  end if;
  if length(v_nom) > 80 then
    raise exception 'el nom es massa llarg' using errcode = '22023';
  end if;
  if v_digits not between 9 and 15 then
    raise exception 'aixo no sembla un telefon' using errcode = '22023';
  end if;
  if p_falta_at is null or p_falta_at > now() then
    raise exception 'la falta no pot ser futura' using errcode = '22023';
  end if;

  if v_nota is null then
    raise exception 'un avis sense motiu escrit no es un avis' using errcode = '22023';
  end if;
  if length(v_nota) > 500 then
    raise exception 'la nota es massa llarga' using errcode = '22023';
  end if;
  if v_mesura is not null and length(v_mesura) > 500 then
    raise exception 'la mesura presa es massa llarga' using errcode = '22023';
  end if;

  select t.gravetat into v_suggerida
    from public.avis_tipus t
   where t.clau = p_tipus and t.actiu;
  if not found then
    raise exception 'tipus d''avis desconegut' using errcode = '22023';
  end if;

  v_gravetat := coalesce(p_gravetat, v_suggerida);
  if v_gravetat not between 1 and 3 then
    raise exception 'la gravetat va d''1 a 3' using errcode = '22023';
  end if;

  if v_punts > 0 then
    raise exception 'un avis no dona punts' using errcode = '22023';
  end if;
  if abs(v_punts) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;

  -- Fora del curs amb punts i sostre: es diu ara, no el dia que s'enganxi.
  if v_punts < 0 then
    select pv.punts into v_sostre
      from public.point_values pv
     where pv.mena = 'avisos' and pv.clau = 'sostre_curs';
    if coalesce(v_sostre, 0) > 0 then
      select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;
      if (v_des_de is not null and p_falta_at <  v_des_de)
      or (v_fins_a is not null and p_falta_at >= v_fins_a) then
        raise exception 'la falta no cau dins de cap curs'
          using errcode = '22023', hint = 'avis_fora_del_curs';
      end if;
    end if;
  end if;

  insert into public.avisos_pendents (
    nom, telefon, tipus, gravetat, gravetat_suggerida, punts, nota, mesura_presa,
    falta_at, created_by
  )
  values (
    v_nom, btrim(p_telefon), p_tipus, v_gravetat, v_suggerida, v_punts, v_nota, v_mesura,
    p_falta_at, (select auth.uid())
  )
  returning id into v_id;

  -- Sense nom ni telèfon: `audit_log` es purga als 24 mesos, no amb el curs.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'avis_pendent',
    null,
    jsonb_build_object(
      'pendent', v_id, 'tipus', p_tipus,
      'gravetat', v_gravetat, 'gravetat_suggerida', v_suggerida, 'punts', v_punts
    )
  );

  return v_id;
end $fn$;

comment on function public.crea_avis_pendent(text, text, timestamptz, text, text, int, int, text) is
  'Registra un avis per a algu que encara no te compte, pel nom i el telefon. '
  'Nomes la junta. La falta no pot ser futura, i si resta punts amb sostre ha '
  'de caure dins del curs. Auditat sense el nom ni el telefon.';

alter function public.crea_avis_pendent(text, text, timestamptz, text, text, int, int, text) owner to postgres;
revoke all on function public.crea_avis_pendent(text, text, timestamptz, text, text, int, int, text) from public, anon;
grant execute on function public.crea_avis_pendent(text, text, timestamptz, text, text, int, int, text) to authenticated;

-- ── retirar-ne un ──────────────────────────────────────────────────────────
-- Amb nota obligatòria, com `retira_avis`: retirar és un acte que queda escrit.
-- I el telèfon se'n va: ja no s'ha de buscar ningú.
create or replace function public.retira_avis_pendent(p_id uuid, p_nota text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_p    public.avisos_pendents%rowtype;
  v_nota text := private.nota_neta(coalesce(p_nota, ''));
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

  select * into v_p from public.avisos_pendents where id = p_id for update;
  if not found then
    raise exception 'aquest pendent no existeix' using errcode = '22023';
  end if;
  if v_p.enllacat_at is not null or v_p.retirat_at is not null then
    raise exception 'aquest pendent ja esta resolt' using errcode = '22023';
  end if;

  update public.avisos_pendents
     set retirat_at = now(),
         retirat_by = (select auth.uid()),
         retirat_nota = v_nota,
         telefon = null
   where id = p_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values ((select auth.uid()), 'retira_avis_pendent', null, jsonb_build_object('pendent', p_id));
end $fn$;

comment on function public.retira_avis_pendent(uuid, text) is
  'Retira un avis pendent amb una nota obligatoria i n''esborra el telefon. '
  'Nomes la junta. Auditat.';

alter function public.retira_avis_pendent(uuid, text) owner to postgres;
revoke all on function public.retira_avis_pendent(uuid, text) from public, anon;
grant execute on function public.retira_avis_pendent(uuid, text) to authenticated;

-- ── enllaçar-ne un a mà ────────────────────────────────────────────────────
-- PER ALS CASOS QUE L'ENGANXADA NO DECIDEIX SOLA: dos perfils actius amb el
-- mateix telèfon, o algú que es va fer el compte amb un altre número. La junta
-- tria la persona i el pendent es converteix en avís amb les regles de sempre.
--
-- AQUÍ L'ERROR SÍ QUE PUJA. Si el sostre ho refusa, qui ho ha de saber és la
-- junta que ha premut el botó, amb el HINT que la pantalla tradueix; el pendent
-- es queda com era. És el contrari que a l'enganxada automàtica de la 88, on
-- qui dispara la transacció és un soci que desa el seu telèfon.
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

comment on function public.enllaca_avis_pendent(uuid, uuid) is
  'Converteix a ma un avis pendent en un avis de `p_user_id`, datat el dia de '
  'la falta. Nomes la junta. Els refusos del nucli (sostre, persona) pugen. '
  'Auditat.';

alter function public.enllaca_avis_pendent(uuid, uuid) owner to postgres;
revoke all on function public.enllaca_avis_pendent(uuid, uuid) from public, anon;
grant execute on function public.enllaca_avis_pendent(uuid, uuid) to authenticated;

-- ── la purga en tancar el curs ─────────────────────────────────────────────
-- Cada nit, i no en el moment de tancar el curs, perquè el curs no es tanca amb
-- cap acte: es tanca el dia que la junta escriu el calendari nou a «Els
-- períodes» i el `global` passa a començar més tard. Un disparador a
-- `ranking_periods` ho faria a l'instant, i esborraria dades si la junta es
-- confon de data i ho desfà un minut després; la nit dona aquell minut.
--
-- ELS QUE ESPEREN I ELS RETIRATS, NO ELS ENLLAÇATS. Un retirat ja no porta
-- telèfon —el CHECK de la taula ho garanteix— però sí el nom i la nota d'algú
-- que no té compte i que no en tindrà cap avís: guardar-los per sempre no
-- serveix de res. Un enllaçat és la història d'un avís que ja viu a `avisos`, i
-- es queda.
--
-- I NOMÉS SI EL CURS JA HA COMENÇAT. `private.periode_curs()` tria la fila
-- `global` per `ordre` i no per data, o sigui que el `des_de` que torna pot
-- ser al futur: un `starts_at` posat malament, o el calendari de setembre
-- escrit al juliol. Amb un `des_de` futur, «anterior al curs» voldria dir
-- TOTS els pendents del curs que encara corre, i aquella nit se n'anirien
-- sense cap manera de tornar-los: és un `delete`. Sense curs escrit (`des_de`
-- null) tampoc no hi ha res de tancat. En tots dos casos no s'esborra res.
create or replace function private.purga_avis_pendents()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_des_de  timestamptz;
  v_deleted integer := 0;
begin
  select pc.des_de into v_des_de from private.periode_curs() pc;
  if v_des_de is null or v_des_de > now() then
    return 0;
  end if;

  delete from public.avisos_pendents
   where enllacat_at is null
     and falta_at < v_des_de;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $fn$;

comment on function private.purga_avis_pendents() is
  'Esborra els avisos pendents no enllacats (els que esperen i els retirats) '
  'amb la falta d''un curs ja tancat. No fa res si el curs actual encara no ha '
  'comencat: un `des_de` futur esborraria els del curs que corre. Cada nit per '
  'pg_cron. No la crida ningu mes.';

alter function private.purga_avis_pendents() owner to postgres;
revoke all on function private.purga_avis_pendents() from public, anon, authenticated;

-- Deu minuts abans que la del registre, i amb nom propi: `cron.schedule`
-- reemplaça un job amb el mateix nom, o sigui que tornar a passar això no els
-- apila.
select cron.schedule(
  'purga-avis-pendents',
  '20 4 * * *',
  $$ select private.purga_avis_pendents() $$
);

-- ── i les tres accions noves al registre ───────────────────────────────────
-- La llista sencera, com a la 86: la migració més nova que la declara la porta
-- tota.
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

-- Els avisos de la junta: un registre de mal comportament amb pes, punts i un
-- comptador que caduca cada curs.
--
-- EL FORAT QUE TAPA. La junta pot premiar i no pot corregir. Els quatre botons
-- de `/junta/punts/:eventId` només sumen, i l'única acció que hi ha sobre una
-- persona a `/junta/socis` és donar-la de baixa. Entre «no facis res» i «fora
-- de l'associació» no hi ha res, o sigui que quan algú no es presenta a un
-- muntatge que havia dit que faria, la resposta que l'app sap donar és cap. La
-- conversa es té pel grup, no queda enlloc, i el juny següent la junta nova no
-- sap què va passar ni amb qui.
--
-- UN AVÍS I ELS SEUS PUNTS VAN SEPARATS A POSTA. Es pot avisar sense tocar el
-- rànquing —que és el que vol dir un primer avís— i es poden restar punts sense
-- avisar, que és l'ajust manual de sempre. Lligar-les obligaria a inventar-se
-- un càstig per poder dir alguna cosa.
--
-- QUÈ ES COPIA I QUÈ ES RESOL PER JOIN. `avisos.gravetat` es copia del catàleg
-- en crear la fila i no s'hi torna mai. És la mateixa doctrina que
-- `point_values.tipus_esdeveniment` respecte de `events.puntos`: re-afinar el
-- barem al juny no ha de reescriure retroactivament què va valer una nit
-- d'octubre. `punts_suggerits` només precarrega el formulari, pel mateix motiu.
--
-- QUI HO VEU. Només la junta i la persona afectada, amb una sola política de
-- lectura i CAP grant d'escriptura per a `authenticated`. Allò que un soci no
-- ha de poder fer de cap manera és un grant que falta, no una política que
-- falta. Convé dir-ho igualment: el rànquing publica totals, i restar 25 punts
-- a algú es nota en la seva posició encara que el motiu no es publiqui. El que
-- queda privat és el PERQUÈ, no que el saldo hagi baixat.
--
-- QUANT ES GUARDA. Res no es purga. La fila explica un moviment del llibre
-- major que no es purga mai, i un `-25` orfe és pitjor que la fila que
-- l'explica. `audit_log` sí que es purga als 24 mesos, i per això el `detall`
-- que s'hi escriu més avall NO porta la nota: la nota viu a `avisos`, que és
-- on la pot llegir qui hi surt. El que caduca és el COMPTADOR, no la fila.

-- ── el llibre major aprèn dos motius ────────────────────────────────────────
-- Cal `drop` i tornar a crear la constraint sencera: és el que va fer la
-- migració 15 per encabir-hi `conduir`.
--
-- DOS MOTIUS I NO UN. Retirar un avís no és una edició —`points_log` és
-- append-only per disparador— sinó una fila compensatòria al costat de la
-- primera. Amb un sol motiu el llibre major netejaria a zero i la retirada
-- seria una absència en comptes d'un acte; amb dos, les dues línies es veuen al
-- perfil, que és el que es vol:
--
--   14/10   Avís           -25   «no va venir al muntatge»
--   20/10   Avís retirat   +25   «havia avisat, error nostre»
alter table public.points_log drop constraint points_log_motivo_check;

alter table public.points_log add constraint points_log_motivo_check
  check (motivo in (
    'asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual',
    'avis', 'avis_retirat'
  ));

-- ── el canvi de criteri que la migració 15 va deixar escrit ─────────────────
-- La 15 reserva els punts negatius a l'owner, i en diu el motiu: «taking points
-- away is the kind of thing that starts arguments». Que qualsevol admin pugui
-- restar és un canvi deliberat d'aquell criteri, no un detall, i es fa aquí
-- perquè és aquí que deixa de ser sostenible: si `avisa()` deixa restar a un
-- admin i `award_points` no, hi ha dos camins amb regles diferents per a la
-- mateixa operació, que és exactament la mena de cosa que la junta de l'any que
-- ve trobarà incomprensible.
--
-- L'ALTERNATIVA DESCARTADA era deixar `award_points` com estava i que `avisa()`
-- escrigués a `points_log` pel seu compte. Menys radi de canvi avui i dues
-- regles a mantenir per sempre. Es tria un sol criteri, escrit un sol cop, amb
-- el REGISTRE com a garantia en comptes del rol: tota resta queda a
-- `audit_log` amb nom i hora des de la migració 15.
--
-- LA SIGNATURA NO CANVIA, o sigui que `create or replace` hi arriba i no es
-- crea cap sobrecàrrega ni cap PGRST203.
--
-- I LA SEVA ALLOWLIST NO GUANYA ELS DOS MOTIUS NOUS. La constraint de la taula
-- els admet; aquesta funció no. És la tanca que fa que l'única porta a una fila
-- d'avís sigui `avisa()`, que és qui copia la gravetat, comprova el sostre i
-- deixa la fila d'`avisos` al costat. Un `award_points(..., 'avis', -25)` que
-- passés deixaria el `-25` sense cap avís que l'expliqui.
create or replace function public.award_points(
  p_user_id uuid,
  p_event_id uuid,
  p_motivo text,
  p_puntos int,
  p_nota text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;

  insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
  values (p_user_id, p_event_id, p_motivo, p_puntos, p_nota, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'award_points',
    p_user_id,
    jsonb_build_object('motiu', p_motivo, 'punts', p_puntos, 'esdeveniment', p_event_id)
  );

  return v_id;
end $fn$;

comment on function public.award_points(uuid, uuid, text, int, text) is
  'Dona o treu punts a ma. Des de la migracio 69 restar demana `is_admin()` i '
  'no `is_owner()`: un sol criteri per a tot, amb el registre com a garantia en '
  'comptes del rol. No admet els motius `avis` ni `avis_retirat`, que nomes '
  'poden venir d''`avisa()` i de `retira_avis()`.';

-- ── el catàleg ─────────────────────────────────────────────────────────────
-- Editable per la junta sense desplegar, exactament pel mateix motiu que
-- `point_values` i `ranking_periods`: un barem que necessita una pull request
-- és un barem que es quedarà com estigui.
--
-- `etiqueta` EXISTEIX PER LA MATEIXA RAÓ QUE A `ranking_periods`. Els tipus
-- d'aquí es pinten amb `t(`avisos.tipus.${clau}`)`, adreçats dinàmicament com
-- `badges.*` i `motive.*`. Els quatre que se sembren tenen traducció als tres
-- locales; un `clau` que la junta inventi no en tindrà cap, i sense fallback la
-- pantalla ensenyaria la cadena crua a qui l'hagi de llegir.
--
-- `actiu` I NO UN DELETE. Un tipus que ja ha avisat algú no es pot esborrar
-- —hi ha una clau forana que hi apunta, i ha d'apuntar-hi: és el que explica un
-- avís de fa dos cursos—. Retirar-lo del formulari sense trencar el que ja hi
-- ha és un booleà.
create table public.avis_tipus (
  clau            text primary key check (clau ~ '^[a-z][a-z_]{0,23}$'),
  gravetat        int  not null check (gravetat between 1 and 3),
  -- Negatius o zero: un avís no dona punts. Zero és un avís que no toca el
  -- rànquing, que és el que ha de ser un primer avís.
  punts_suggerits int  not null default 0 check (punts_suggerits between -500 and 0),
  etiqueta        text check (etiqueta is null or length(btrim(etiqueta)) between 1 and 40),
  actiu           boolean not null default true,
  ordre           int  not null default 0
);

comment on table public.avis_tipus is
  'El cataleg d''avisos, editable per la junta sense desplegar. `gravetat` i '
  '`punts_suggerits` nomes precarreguen el formulari: un cop l''avis existeix, '
  'els seus son els seus, i re-afinar el cataleg al juny no reescriu que va '
  'valer una nit d''octubre.';

alter table public.avis_tipus enable row level security;

-- El soci el llegeix per poder posar nom al seu propi avís al perfil. Escriure
-- hi va per RPC: la migració 25 ja va treure els grants d'escriptura de
-- `point_values` i moure'l a `admin_set_point_value`, i aquesta taula neix amb
-- la doctrina vigent i no amb la que hi havia a la 15.
create policy avis_tipus_select_member on public.avis_tipus
  for select to authenticated
  using ((select private.is_active_member()));

revoke all on public.avis_tipus from anon, authenticated;
grant select on public.avis_tipus to authenticated;
grant select, insert, update, delete on public.avis_tipus to service_role;

-- Valors de sortida, i res més que això. `on conflict do nothing` vol dir que
-- tornar a passar les migracions no desfà un número que la junta hagi mogut.
insert into public.avis_tipus (clau, gravetat, punts_suggerits, ordre) values
  ('no_va_venir',  1,  -10, 1),
  ('mal_gest',     1,    0, 2),
  ('va_deixar_ho', 2,  -25, 3),
  ('greu',         3,  -50, 4)
on conflict (clau) do nothing;

-- ── el registre ────────────────────────────────────────────────────────────
-- LA NOTA ÉS OBLIGATÒRIA I ÉS UNA RESTRICCIÓ DE LA TAULA, no del navegador. Un
-- avís sense motiu escrit és el que després ningú no sap defensar.
create table public.avisos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  tipus         text not null references public.avis_tipus (clau),
  -- Copiada en crear-lo, no resolta per join.
  gravetat      int  not null check (gravetat between 1 and 3),
  nota          text not null check (length(btrim(nota)) between 1 and 500),
  -- On va passar. Pot ser una reunió de junta encara que la fila de punts no ho
  -- pugui ser: vegeu `avisa()`.
  event_id      uuid references public.events (id) on delete set null,
  -- La fila del llibre major que va restar els punts, si en va restar.
  points_log_id uuid references public.points_log (id) on delete set null,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  retirat_at    timestamptz,
  retirat_by    uuid references public.profiles (id) on delete set null,
  retirat_nota  text check (retirat_nota is null or length(btrim(retirat_nota)) between 1 and 500),
  -- I la compensatòria. Es desa en comptes de buscar-la per motiu perquè una
  -- persona pot tenir-ne diverses el mateix curs i «la que va tornar aquests
  -- punts» ha de ser una sola fila, no una heurística.
  retirat_points_log_id uuid references public.points_log (id) on delete set null,
  -- Retirat vol dir les quatre columnes o cap. Sense això, un `retirat_by` amb
  -- `retirat_at` a null seria un avís mig retirat que cap pantalla sap pintar.
  constraint avisos_retirat_sencer check (
    (retirat_at is null
      and retirat_by is null
      and retirat_nota is null
      and retirat_points_log_id is null)
    or (retirat_at is not null and retirat_nota is not null)
  )
);

comment on table public.avisos is
  'El registre disciplinari. Nomes el veuen la junta i qui hi surt. Sense cap '
  'grant d''escriptura per a `authenticated`: l''unica porta son `avisa()` i '
  '`retira_avis()`. No es purga mai —explica un moviment del llibre major que '
  'tampoc no es purga—; el que caduca cada curs es el comptador, no la fila.';

alter table public.avisos enable row level security;

create policy avisos_select_self_or_admin on public.avisos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

revoke all on public.avisos from anon, authenticated;
grant select on public.avisos to authenticated;
grant select, insert, update, delete on public.avisos to service_role;

-- L'únic índex que serveix un `where` de debò: el comptador del període, que el
-- demanen la fitxa del soci, la llista de socis i el rebedor.
create index avisos_user_created_idx on public.avisos (user_id, created_at desc);

-- I els de les claus foranes, pel camí de BORRAT i no per cap consulta, amb el
-- mateix raonament escrit a la migració 58: `profiles.id` referencia
-- `auth.users(id)` amb ON DELETE CASCADE, i esborrar un compte de Google
-- recorre totes aquestes claus.
create index avisos_tipus_idx                 on public.avisos (tipus);
create index avisos_event_idx                 on public.avisos (event_id);
create index avisos_points_log_idx            on public.avisos (points_log_id);
create index avisos_created_by_idx            on public.avisos (created_by);
create index avisos_retirat_by_idx            on public.avisos (retirat_by);
create index avisos_retirat_points_log_idx    on public.avisos (retirat_points_log_id);

-- ── el llindar i el sostre ─────────────────────────────────────────────────
-- DOS NÚMEROS QUE LA JUNTA MOU SENSE DESPLEGAR, i el repositori ja té una
-- taula per a exactament això. Fer-ne una de nova voldria dir una taula, una
-- política, uns grants, una RPC, una acció d'auditoria i un bloc de pantalla
-- per guardar dos enters — quan `point_values` ja porta tot això fet, ja
-- surt a `/junta/barem` i ja s'edita per `admin_set_point_value`, que audita.
--
-- EL QUE COSTA és que `mena` deixa de voler dir «punts» i passa a voler dir
-- «número que la junta mou». És un preu petit i es paga aquí, escrit.
--
-- QUÈ FA EL LLINDAR: marca la fitxa quan la gravetat acumulada del període hi
-- arriba, i posa una entrada a `/junta` perquè algú ho miri. NO FA RES SOL. No
-- dona de baixa, no bloqueja, no envia res. Donar de baixa continua sent una
-- decisió humana amb el seu botó, la seva confirmació i el seu registre.
--
-- QUÈ FA EL SOSTRE: `abs(punts) > 500` per crida no impedeix repetir la crida.
-- El sostre és el màxim de punts que es poden treure a una persona en un curs.
-- Zero vol dir sense sostre, que és la sortida que la junta té sense haver de
-- tocar cap esquema.
alter table public.point_values drop constraint point_values_mena_check;

alter table public.point_values add constraint point_values_mena_check
  check (mena in ('motiu', 'tipus_esdeveniment', 'avisos'));

insert into public.point_values (mena, clau, punts, ordre) values
  ('avisos', 'llindar',     4, 1),
  ('avisos', 'sostre_curs', 200, 2)
on conflict (mena, clau) do nothing;

-- ── avisar ─────────────────────────────────────────────────────────────────
-- QUI POT REBRE UN AVÍS: qui és soci o ho ha estat. Un `pendent` encara no ha
-- entrat a l'associació i no hi ha res a registrar-li; tancar l'expedient d'algú
-- que ja és de baixa, en canvi, té sentit, i restar-li punts no en té gens però
-- tampoc no fa cap mal —no surt al rànquing—. Es deixa passar i es diu aquí, que
-- és millor que una regla que la junta descobreix el dia que la necessita.
--
-- LA REUNIÓ DE JUNTA, I PER QUÈ L'AVÍS I ELS SEUS PUNTS SE SEPAREN AQUÍ.
-- `private.no_points_from_junta_meetings` bloqueja qualsevol fila de
-- `points_log` lligada a un esdeveniment amb `abast = 'junta'`, i és una regla
-- de la taula que val per a tots els camins. Un avís posat en una reunió de
-- junta amb `p_event_id` ple hi petaria amb 22023. Es podria refusar la crida;
-- no es fa. On va passar una cosa i d'on surten uns punts són dues preguntes
-- diferents: l'AVÍS es queda amb la reunió, que és on va passar, i la fila de
-- PUNTS hi va sense esdeveniment. Refusar-ho obligaria la junta a mentir sobre
-- el lloc per poder registrar el fet.
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
  -- retirar un avís torna els punts i també torna el marge.
  if v_punts < 0 then
    select pv.punts into v_sostre
      from public.point_values pv
     where pv.mena = 'avisos' and pv.clau = 'sostre_curs';

    if coalesce(v_sostre, 0) > 0 then
      select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

      select coalesce(sum(pl.puntos), 0)::int into v_ja
        from public.points_log pl
       where pl.user_id = p_user_id
         and pl.motivo in ('avis', 'avis_retirat')
         and (v_des_de is null or pl.created_at >= v_des_de)
         and (v_fins_a is null or pl.created_at <  v_fins_a);

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
  -- la junta; la nota viu a `avisos`, que és on la pot llegir qui hi surt.
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
  'join, i respecta el sostre de punts del curs. L''avis es queda amb '
  'l''esdeveniment on va passar encara que la fila de punts no hi pugui anar.';

alter function public.avisa(uuid, text, text, int, uuid) owner to postgres;
revoke all on function public.avisa(uuid, text, text, int, uuid) from public, anon;
grant execute on function public.avisa(uuid, text, text, int, uuid) to authenticated;

-- ── retirar ────────────────────────────────────────────────────────────────
-- Retirar un avís torna els punts sol, amb una fila compensatòria i no amb una
-- edició: `points_log` és append-only per disparador.
--
-- LA COMPENSATÒRIA VA SENSE ESDEVENIMENT a posta. No és res que hagi passat
-- enlloc, i penjar-la de l'esdeveniment original la faria topar amb la tanca de
-- les reunions de junta el dia que l'avís original en vingui d'una.
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
  v_nota   text := btrim(coalesce(p_nota, ''));
  v_comp   uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if length(v_nota) = 0 then
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

comment on function public.retira_avis(uuid, text) is
  'Retira un avis i torna els punts amb una fila compensatoria de motiu '
  '`avis_retirat`. Les dues linies es veuen al perfil a posta: que consti que '
  'hi va haver un avis i que consti que es va retirar. Un avis ja retirat no es '
  'pot tornar a retirar.';

alter function public.retira_avis(uuid, text) owner to postgres;
revoke all on function public.retira_avis(uuid, text) from public, anon;
grant execute on function public.retira_avis(uuid, text) to authenticated;

-- ── editar el catàleg ──────────────────────────────────────────────────────
-- Upsert i no només update, al contrari que `admin_set_point_value`. Allà
-- afegir un `clau` era una pantalla que no podia fer-ho sencer —calia també una
-- CHECK i una allowlist dins `award_points`, i la fila sola hauria estat un
-- botó que falla quan algú el prem—. Aquí no: `avisos.tipus` és una clau forana
-- i no hi ha cap allowlist enlloc, o sigui que una fila nova és tot el que cal.
-- L'`etiqueta` és el que fa que un tipus nou tingui nom sense passar pels
-- locales.
create or replace function public.admin_set_avis_tipus(
  p_clau            text,
  p_gravetat        int,
  p_punts_suggerits int,
  p_ordre           int default 0,
  p_etiqueta        text default null,
  p_actiu           boolean default true
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_abans public.avis_tipus%rowtype;
  v_etiq  text := nullif(btrim(coalesce(p_etiqueta, '')), '');
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_clau !~ '^[a-z][a-z_]{0,23}$' then
    raise exception 'clau invalida' using errcode = '22023';
  end if;
  if p_gravetat is null or p_gravetat not between 1 and 3 then
    raise exception 'la gravetat va d''1 a 3' using errcode = '22023';
  end if;
  if p_punts_suggerits is null or p_punts_suggerits not between -500 and 0 then
    raise exception 'els punts suggerits van de -500 a 0' using errcode = '22023';
  end if;
  if v_etiq is not null and length(v_etiq) > 40 then
    raise exception 'etiqueta massa llarga' using errcode = '22023';
  end if;

  select * into v_abans from public.avis_tipus where clau = p_clau for update;

  insert into public.avis_tipus (clau, gravetat, punts_suggerits, etiqueta, actiu, ordre)
  values (p_clau, p_gravetat, p_punts_suggerits, v_etiq, coalesce(p_actiu, true), coalesce(p_ordre, 0))
  on conflict (clau) do update
    set gravetat = excluded.gravetat,
        punts_suggerits = excluded.punts_suggerits,
        etiqueta = excluded.etiqueta,
        actiu = excluded.actiu,
        ordre = excluded.ordre;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'set_avis_tipus',
    null,
    jsonb_build_object(
      'clau', p_clau,
      'gravetat', p_gravetat,
      'punts_suggerits', p_punts_suggerits,
      'actiu', coalesce(p_actiu, true),
      'abans', case when v_abans.clau is null then null else jsonb_build_object(
        'gravetat', v_abans.gravetat,
        'punts_suggerits', v_abans.punts_suggerits,
        'actiu', v_abans.actiu
      ) end
    )
  );
end $fn$;

comment on function public.admin_set_avis_tipus(text, int, int, int, text, boolean) is
  'Crea o canvia un tipus d''avis. Auditat. No esborra: un tipus que ja ha '
  'avisat algu te una clau forana que hi apunta, i retirar-lo del formulari es '
  '`actiu = false`.';

alter function public.admin_set_avis_tipus(text, int, int, int, text, boolean) owner to postgres;
revoke all on function public.admin_set_avis_tipus(text, int, int, int, text, boolean) from public, anon;
grant execute on function public.admin_set_avis_tipus(text, int, int, int, text, boolean) to authenticated;

-- ── i les tres accions noves al registre ───────────────────────────────────
-- La migració 57 va tancar la llista amb un CHECK precisament perquè afegir una
-- acció obligui a tocar-la, i tocar-la faci fallar `tests/audit-actions.test.ts`
-- fins que hi ha etiqueta en català, castellà i anglès.
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

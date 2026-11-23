-- El registre de viatgers: les dades que una casa rural ha d'enviar de cada
-- persona que hi dorm (RD 933/2021), demanades en apuntar-s'hi i esborrades
-- soles set dies després que s'acabi l'estada.
--
-- ═══ QUÈ ES GUARDA, I QUÈ NO ═══════════════════════════════════════════════
--
-- Els camps que demana el registre i prou: nom, dos cognoms, sexe, tipus i
-- número de document, número de suport, nacionalitat, data de naixement i
-- adreça de residència (adreça, localitat i país). Més un telèfon d'emergència,
-- que no és del registre però és el que la junta necessita si passa alguna
-- cosa durant l'estada.
--
-- CAP IMATGE DE CAP DOCUMENT, ni aquí ni a Storage. L'AEPD considera excessiu
-- guardar les dues cares del DNI —hi ha més dades de les que demana la norma—
-- i ha sancionat allotjaments per fer-ho. No hi ha cap columna on pogués anar
-- una foto, ni cap bucket.
--
-- ═══ DE QUI SÓN: (PERSONA, ESDEVENIMENT) ═══════════════════════════════════
--
-- La clau primària és el parell, i no la persona. Les dades no es reaprofiten
-- d'una casa per a la següent, ni dins del mateix curs: es tornen a demanar.
-- És el que fa possible esborrar-les amb l'estada: si fossin de la persona,
-- caldria decidir quan deixen de servir, i la resposta honesta seria «mai».
--
-- ═══ A `public` AMB RLS, I NO A `private` AMB RPC PER A TOT ════════════════
--
-- Es va considerar posar la taula a `private`, com `event_geo`: PostgREST no
-- l'exposaria, i qualsevol accés hauria de passar per una funció. Es descarta,
-- i el motiu és on queda el risc:
--
--   El propietari ha de fer quatre coses —llegir, desar, editar, esborrar— i
--   totes quatre es resumeixen en `user_id = auth.uid()`. A `public`, això és
--   una política de RLS, que és el mecanisme més provat del repositori (a les
--   dues capes). A `private` serien quatre funcions `security definer` que
--   reescriuen el mateix predicat a mà, i una funció definer amb un `where`
--   oblidat retorna les dades de tothom sense que res es posi vermell.
--
--   El que `private` compraria —que un grant o una política futura no la
--   puguin obrir per accident— aquí ho compren les proves: la 495 fixa les
--   quatre polítiques pel nom, asserta que cap no mira `is_admin()`, i fixa els
--   grants de columna. Una política nova per a la junta fa petar el CI.
--
-- LA JUNTA NO TÉ CAP POLÍTICA DE LECTURA. Les llegeix només amb
-- `admin_dades_viatgers()`, que mira el rol, només torna les de qui té plaça a
-- aquell esdeveniment i escriu a `audit_log` qui les ha obert, quan i de qui.
--
-- ═══ QUAN ES PODEN ESCRIURE ═══════════════════════════════════════════════
--
-- La política d'escriptura demana tres coses, a més de ser teves: que
-- l'esdeveniment les demani, que hi estiguis apuntat (sí, en espera, demanat
-- o ja dins) i que no hagin caducat. `private.pot_desar_viatger()` ho mira com
-- a definer, perquè una política que llegeix `attendances` o `events` passa
-- per la RLS d'aquelles taules (vegeu la 02).
--
-- ESBORRAR-LES, SEMPRE. El dret de supressió no espera res.
--
-- ═══ QUAN SE'N VAN ════════════════════════════════════════════════════════
--
--   SET DIES DESPRÉS DEL FINAL. El final és `event_details.ends_at` i, si no
--   n'hi ha, l'inici més sis hores: la mateixa regla que `src/lib/eventEnd.ts`
--   i que la 36 fa servir per a la finestra de fitxatge. Una casa rural de tres
--   dies caduca set dies després del diumenge, no del divendres. La purga
--   corre CADA HORA i no cada nit: «set dies» no ha de voler dir «set dies i
--   gairebé un altre».
--
--   QUAN DEIXES D'ANAR-HI. Un `no`, un `potser`, un `rebutjat` o un
--   `cancelado` les esborra: ja no hi ha cap allotjament a qui enviar-les.
--
--   QUAN ET DONES DE BAIXA, o s'esborra el compte (`on delete cascade`).
--
--   QUAN L'ESDEVENIMENT DEIXA DE DEMANAR-LES, o s'esborra. Treure la casella
--   no les amaga: les esborra, i la RPC diu quantes abans que la junta
--   confirmi.
--
-- Totes aquestes són disparadors o cascades i no feina de la RPC que toca: un
-- `update` fet des de l'editor de SQL també les ha d'esborrar.
--
-- ═══ L'AUDITORIA NO COPIA CAP DADA ════════════════════════════════════════
--
-- `audit_log` es purga als 24 mesos, no als set dies: si hi anés el número de
-- document, el registre seria el lloc on les dades sobreviuen a la seva pròpia
-- purga. Hi va qui, quan, de quin esdeveniment, si s'ha exportat i els `id` de
-- les persones, que és el que cal per contestar «qui ha vist les meves dades».

-- ── la casella ─────────────────────────────────────────────────────────────
-- Una columna d'`events` i no `tipo = 'casa_rural'`, pel mateix motiu que
-- `cal_confirmacio` a la 27: és una propietat de l'estada, no d'una categoria.
-- `authenticated` té SELECT de taula sencera a `events`, i aquí és el que es
-- vol: qualsevol que vegi l'esdeveniment ha de saber que se li demanaran.
--
-- NO ENTRA A `events_public` NI A `admin_save_event`. Totes dues tenen la
-- llista de columnes sencera escrita, i tocar-les vol dir reescriure-les; la
-- casella es llegeix d'`events` i s'escriu amb una RPC pròpia, auditada.
alter table public.events
  add column demana_viatger boolean not null default false;

comment on column public.events.demana_viatger is
  'Si en apuntar-s''hi es demanen les dades del registre de viatgers. Nomes '
  'la mou admin_set_demana_viatger(). Posar-la a false esborra les dades que '
  'ja s''hi havien desat.';

-- ── les regles, un cop ─────────────────────────────────────────────────────
-- Quins estats volen dir «hi vaig». Els tres de qui té o pot tenir plaça, i el
-- de qui ja és dins.
create or replace function private.esta_apuntat(p_estado text)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select p_estado in ('si', 'espera', 'sollicitat', 'asistio')
$$;

comment on function private.esta_apuntat(text) is
  'Si un estat d''assistencia vol dir que la persona hi va (o hi pot anar). '
  'Qui esta apuntat pot desar dades de viatger; qui deixa de ser-ho les perd.';

-- Un camp de text net: sense blancs als extrems (la regla de la 77, sencera),
-- sense caràcters de control i amb un màxim. Definer perquè `nota_neta` no té
-- grant per a `authenticated`, i un CHECK corre amb els privilegis de qui
-- insereix.
create or replace function private.camp_viatger_net(p_text text, p_max int)
returns boolean
language sql
immutable
strict
parallel safe
security definer
set search_path = ''
as $$
  select coalesce(p_text = private.nota_neta(p_text), false)
     and length(p_text) <= p_max
     and p_text !~ '[[:cntrl:]]'
$$;

comment on function private.camp_viatger_net(text, int) is
  'Si un camp de text de les dades de viatger es pot desar tal com es: net als '
  'extrems, sense caracters de control i no mes llarg que el maxim.';

-- EL DOCUMENT. La lletra del DNI i del NIE es comprova, perquè un dígit
-- canviat és l'error més fàcil de fer amb el polze i el que l'allotjament no
-- podrà arreglar. El `case` no és estètica: Postgres no promet l'ordre d'un
-- `and`, i el `::bigint` d'un número que no és un número petaria amb 22P02 en
-- lloc de deixar que el CHECK digui que no.
--
-- EL NÚMERO DE SUPORT és el que el registre demana per al DNI i el NIE. Un
-- passaport no en té, ni el document d'identitat d'un altre país de la UE (que
-- és el que 'id_ue' vol dir: el DNI espanyol té el seu tipus), i per això ha de
-- ser null. D'aquest darrer només es pot comprovar que és alfanumèric: cada
-- país numera els seus documents com vol i no hi ha cap lletra de control comuna.
create or replace function private.document_viatger_valid(
  p_tipus text, p_numero text, p_suport text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_tipus = 'dni' then
      case when p_numero ~ '^[0-9]{8}[A-Z]$' and coalesce(p_suport ~ '^[A-Z0-9]{6,20}$', false)
        then substr('TRWAGMYFPDXBNJZSQVHLCKE', (left(p_numero, 8)::bigint % 23)::int + 1, 1)
             = right(p_numero, 1)
        else false end
    when p_tipus = 'nie' then
      case when p_numero ~ '^[XYZ][0-9]{7}[A-Z]$' and coalesce(p_suport ~ '^[A-Z0-9]{6,20}$', false)
        then substr('TRWAGMYFPDXBNJZSQVHLCKE',
                    ((translate(left(p_numero, 1), 'XYZ', '012') || substr(p_numero, 2, 7))::bigint % 23)::int + 1,
                    1)
             = right(p_numero, 1)
        else false end
    when p_tipus in ('passaport', 'id_ue') then
      coalesce(p_numero ~ '^[A-Z0-9]{3,20}$', false) and p_suport is null
    else false
  end
$$;

comment on function private.document_viatger_valid(text, text, text) is
  'Si un document es plausible: DNI i NIE amb la lletra de control bona i el '
  'numero de suport, passaport i document d''identitat de la UE alfanumerics i '
  'sense suport. Majuscules i sense espais: el client normalitza abans d''enviar.';

-- ── la taula ───────────────────────────────────────────────────────────────
create table public.dades_viatger (
  event_id           uuid not null references public.events (id) on delete cascade,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  nom                text not null check (private.camp_viatger_net(nom, 80)),
  cognom1            text not null check (private.camp_viatger_net(cognom1, 80)),
  -- Opcional: no tothom en té dos. Absent és null, mai la cadena buida.
  cognom2            text check (private.camp_viatger_net(cognom2, 80)),
  sexe               text not null check (sexe in ('home', 'dona', 'altre')),
  tipus_document     text not null check (tipus_document in ('dni', 'nie', 'passaport', 'id_ue')),
  numero_document    text not null,
  numero_suport      text,
  -- Codis ISO 3166-1 alfa-2. El nom del país el posa el client, en la llengua
  -- de qui el llegeix.
  nacionalitat       text not null check (nacionalitat ~ '^[A-Z]{2}$'),
  -- `current_date` en un CHECK, i per què aquí sí: la 87 no posa `now()` en un
  -- CHECK perquè la condició es tornava MÉS estricta amb el temps i hauria fet
  -- petar l'UPDATE d'una fila que era vàlida. Aquesta es torna més permissiva:
  -- una data que ja no era futura no ho tornarà a ser mai.
  data_naixement     date not null
                     check (data_naixement >= date '1900-01-01' and data_naixement <= current_date),
  adreca             text not null check (private.camp_viatger_net(adreca, 160)),
  localitat          text not null check (private.camp_viatger_net(localitat, 80)),
  pais               text not null check (pais ~ '^[A-Z]{2}$'),
  -- Dígits, amb el `+` del prefix si n'hi ha. El client treu espais i guions.
  telefon_emergencia text not null check (telefon_emergencia ~ '^\+?[0-9]{9,15}$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  primary key (event_id, user_id),
  constraint dades_viatger_document check (
    private.document_viatger_valid(tipus_document, numero_document, numero_suport)
  )
);

comment on table public.dades_viatger is
  'Les dades del registre de viatgers (RD 933/2021) d''una persona per a un '
  'esdeveniment concret. Cap imatge de cap document. El propietari les llegeix, '
  'desa, edita i esborra per RLS; la junta nomes les llegeix amb '
  'admin_dades_viatgers(), que audita. S''esborren soles set dies despres del '
  'final de l''esdeveniment, quan la persona deixa d''anar-hi o es dona de '
  'baixa, i quan l''esdeveniment deixa de demanar-les.';

-- Per la cascada del perfil i pel disparador de la baixa; la clau primària ja
-- cobreix les consultes per esdeveniment.
create index dades_viatger_user_idx on public.dades_viatger (user_id);

-- ── quan caduquen ──────────────────────────────────────────────────────────
create or replace function private.viatger_caduca(p_event_id uuid)
returns timestamptz
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select coalesce(d.ends_at, e.starts_at + interval '6 hours') + interval '7 days'
    from public.events e
    left join public.event_details d on d.event_id = e.id
   where e.id = p_event_id
$$;

comment on function private.viatger_caduca(uuid) is
  'Quan s''esborren les dades de viatger d''un esdeveniment: set dies despres '
  'del final (ends_at, o l''inici mes sis hores, com src/lib/eventEnd.ts).';

-- ── qui en pot desar ───────────────────────────────────────────────────────
-- Només contesta sobre qui pregunta, o sigui que el grant no filtra res: saber
-- si TU pots desar dades en un esdeveniment no diu res de ningú altre.
create or replace function private.pot_desar_viatger(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_member()
     and exists (
       select 1 from public.events e
        where e.id = p_event_id and e.demana_viatger and e.tipo <> 'reunio'
     )
     and exists (
       select 1 from public.attendances a
        where a.event_id = p_event_id
          and a.user_id = (select auth.uid())
          and private.esta_apuntat(a.estado)
     )
     and coalesce(private.viatger_caduca(p_event_id) > now(), false)
$$;

comment on function private.pot_desar_viatger(uuid) is
  'Si qui pregunta pot desar dades de viatger en aquest esdeveniment: soci '
  'actiu, l''esdeveniment les demana, hi esta apuntat i encara no han caducat.';

-- ── els grants i les polítiques ────────────────────────────────────────────
alter table public.dades_viatger enable row level security;

create policy dades_viatger_select_own on public.dades_viatger
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy dades_viatger_insert_own on public.dades_viatger
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.pot_desar_viatger(event_id));

create policy dades_viatger_update_own on public.dades_viatger
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.pot_desar_viatger(event_id));

create policy dades_viatger_delete_own on public.dades_viatger
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- COLUMNA PER COLUMNA, perquè un grant de taula a l'UPDATE deixaria moure una
-- fila a un altre esdeveniment o a una altra persona —la política ho
-- refusaria, però la política és la segona línia—. I les dates no les escriu
-- ningú: `created_at` és el default i `updated_at` el disparador.
revoke all on public.dades_viatger from anon, authenticated;
grant select, delete on public.dades_viatger to authenticated;
grant insert (
  event_id, user_id, nom, cognom1, cognom2, sexe, tipus_document, numero_document,
  numero_suport, nacionalitat, data_naixement, adreca, localitat, pais, telefon_emergencia
) on public.dades_viatger to authenticated;
grant update (
  nom, cognom1, cognom2, sexe, tipus_document, numero_document,
  numero_suport, nacionalitat, data_naixement, adreca, localitat, pais, telefon_emergencia
) on public.dades_viatger to authenticated;
grant select, insert, update, delete on public.dades_viatger to service_role;

-- Les quatre regles les fan servir els CHECK i la política, que corren amb els
-- privilegis de qui escriu.
revoke all on function private.esta_apuntat(text) from public, anon;
revoke all on function private.camp_viatger_net(text, int) from public, anon;
revoke all on function private.document_viatger_valid(text, text, text) from public, anon;
revoke all on function private.pot_desar_viatger(uuid) from public, anon;
grant execute on function private.esta_apuntat(text) to authenticated;
grant execute on function private.camp_viatger_net(text, int) to authenticated;
grant execute on function private.document_viatger_valid(text, text, text) to authenticated;
grant execute on function private.pot_desar_viatger(uuid) to authenticated;
-- La data de caducitat d'un esdeveniment no és cap secret, però tampoc no la
-- necessita ningú de fora: la fa servir la purga i les funcions definer.
revoke all on function private.viatger_caduca(uuid) from public, anon, authenticated;

alter function private.camp_viatger_net(text, int) owner to postgres;
alter function private.viatger_caduca(uuid) owner to postgres;
alter function private.pot_desar_viatger(uuid) owner to postgres;

-- ── la validació, sense la fila al registre de Postgres ────────────────────
-- UN CHECK QUE FALLA ESCRIU LA FILA SENCERA AL DETAIL de l'error —«Failing row
-- contains (…)»—, i el DETAIL va als logs de Postgres: el número de document,
-- l'adreça i el telèfon quedarien en un lloc que la purga dels set dies no
-- toca. Un NOT NULL que falla fa el mateix.
--
-- Per això les mateixes regles es miren aquí, en un BEFORE, que corre abans
-- que cap CHECK i que cap NOT NULL i refusa dient QUIN camp i no QUÈ hi havia.
-- El codi és el de sempre, 23514, i el HINT `viatger_invalid` és el que la
-- pantalla tradueix (`src/lib/errors.ts`). La sentència que PostgREST registra
-- en un error porta els valors com a paràmetres, que no s'escriuen.
--
-- ELS CHECK ES QUEDEN, i no poden fallar: el disparador els fa tots abans.
-- Són la definició de la taula que es llegeix d'un cop d'ull, i la xarxa per al
-- dia que algú desactivi disparadors per carregar dades a mà.
create or replace function private.dades_viatger_valides()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_camp text;
begin
  v_camp := case
    when new.event_id is null or new.user_id is null then 'clau'
    when new.nom is null or not private.camp_viatger_net(new.nom, 80) then 'nom'
    when new.cognom1 is null or not private.camp_viatger_net(new.cognom1, 80) then 'cognom1'
    when new.cognom2 is not null and not private.camp_viatger_net(new.cognom2, 80) then 'cognom2'
    when new.sexe is null or new.sexe not in ('home', 'dona', 'altre') then 'sexe'
    when new.tipus_document is null
      or new.tipus_document not in ('dni', 'nie', 'passaport', 'id_ue') then 'tipus_document'
    when not coalesce(
      private.document_viatger_valid(new.tipus_document, new.numero_document, new.numero_suport),
      false) then 'numero_document'
    when new.nacionalitat is null or new.nacionalitat !~ '^[A-Z]{2}$' then 'nacionalitat'
    when new.data_naixement is null
      or new.data_naixement < date '1900-01-01'
      or new.data_naixement > current_date then 'data_naixement'
    when new.adreca is null or not private.camp_viatger_net(new.adreca, 160) then 'adreca'
    when new.localitat is null or not private.camp_viatger_net(new.localitat, 80) then 'localitat'
    when new.pais is null or new.pais !~ '^[A-Z]{2}$' then 'pais'
    when new.telefon_emergencia is null
      or new.telefon_emergencia !~ '^\+?[0-9]{9,15}$' then 'telefon_emergencia'
  end;

  if v_camp is not null then
    raise exception 'dades de viatger no valides: %', v_camp
      using errcode = '23514', hint = 'viatger_invalid';
  end if;
  return new;
end $$;

revoke all on function private.dades_viatger_valides() from public, anon, authenticated;

create trigger dades_viatger_valides
  before insert or update on public.dades_viatger
  for each row execute function private.dades_viatger_valides();

-- ── updated_at ─────────────────────────────────────────────────────────────
create or replace function private.dades_viatger_tocades()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function private.dades_viatger_tocades() from public, anon, authenticated;

create trigger dades_viatger_tocades
  before update on public.dades_viatger
  for each row execute function private.dades_viatger_tocades();

-- ── quan deixes d'anar-hi ──────────────────────────────────────────────────
-- Definer perquè l'estat el mouen també la junta (decidir, rebutjar) i les RPC
-- de la porta, i el que s'esborra no és de qui el mou.
create or replace function private.dades_viatger_en_desapuntar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.dades_viatger
     where event_id = old.event_id and user_id = old.user_id;
    return old;
  end if;

  if not private.esta_apuntat(new.estado) then
    delete from public.dades_viatger
     where event_id = new.event_id and user_id = new.user_id;
  end if;
  return new;
end $$;

alter function private.dades_viatger_en_desapuntar() owner to postgres;
revoke all on function private.dades_viatger_en_desapuntar() from public, anon, authenticated;

create trigger attendances_dades_viatger_estat
  after update of estado on public.attendances
  for each row
  when (old.estado is distinct from new.estado)
  execute function private.dades_viatger_en_desapuntar();

create trigger attendances_dades_viatger_fora
  after delete on public.attendances
  for each row execute function private.dades_viatger_en_desapuntar();

-- ── quan et dones de baixa ─────────────────────────────────────────────────
create or replace function private.dades_viatger_en_la_baixa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dades_viatger where user_id = new.id;
  return new;
end $$;

alter function private.dades_viatger_en_la_baixa() owner to postgres;
revoke all on function private.dades_viatger_en_la_baixa() from public, anon, authenticated;

create trigger profiles_dades_viatger_baixa
  after update of estat on public.profiles
  for each row
  when (old.estat is distinct from new.estat and new.estat = 'baixa')
  execute function private.dades_viatger_en_la_baixa();

-- ── quan l'esdeveniment deixa de demanar-les ──────────────────────────────
create or replace function private.dades_viatger_sense_casella()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.dades_viatger where event_id = new.id;
  return new;
end $$;

alter function private.dades_viatger_sense_casella() owner to postgres;
revoke all on function private.dades_viatger_sense_casella() from public, anon, authenticated;

-- SENSE `of demana_viatger`. Un disparador `update of <columna>` només salta
-- si la columna és a la llista del SET, i la casella també la pot treure el
-- disparador de sota quan l'esdeveniment passa a ser una reunió: allà la
-- columna canvia sense que ningú l'hagi escrit.
create trigger events_dades_viatger_casella
  after update on public.events
  for each row
  when (old.demana_viatger and not new.demana_viatger)
  execute function private.dades_viatger_sense_casella();

-- ── una reunió no en demana ────────────────────────────────────────────────
-- `admin_save_event` pot canviar el tipus d'un esdeveniment que ja demanava
-- les dades. Si passa a reunió, la casella cau sola —i amb ella les dades, pel
-- disparador d'aquí dalt—: el formulari ja no la ensenya, o sigui que la junta
-- no la podria treure, i el formulari del soci continuaria acceptant dades per
-- a una cosa on ningú no dorm. El CHECK és la xarxa: amb el disparador al
-- davant no pot fallar.
create or replace function private.reunio_sense_viatgers()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'reunio' then
    new.demana_viatger := false;
  end if;
  return new;
end $$;

revoke all on function private.reunio_sense_viatgers() from public, anon, authenticated;

create trigger events_reunio_sense_viatgers
  before insert or update on public.events
  for each row
  when (new.tipo = 'reunio' and new.demana_viatger)
  execute function private.reunio_sense_viatgers();

alter table public.events
  add constraint events_reunio_sense_viatgers check (not (tipo = 'reunio' and demana_viatger));

-- ── la casella, per a la junta ─────────────────────────────────────────────
-- Torna quantes dades s'han esborrat, que és el que la pantalla diu abans i
-- després. Una reunió no en demana: ningú no hi dorm.
create or replace function public.admin_set_demana_viatger(p_event_id uuid, p_demana boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_tipo       text;
  v_abans      boolean;
  v_esborrades integer := 0;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_demana is null then
    raise exception 'cal dir si o no' using errcode = '22023';
  end if;

  select e.tipo, e.demana_viatger into v_tipo, v_abans
    from public.events e where e.id = p_event_id for update;
  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;
  if p_demana and v_tipo = 'reunio' then
    raise exception 'una reunio no demana dades de viatger' using errcode = '22023';
  end if;

  if v_abans and not p_demana then
    select count(*) into v_esborrades
      from public.dades_viatger v where v.event_id = p_event_id;
  end if;

  update public.events set demana_viatger = p_demana where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'set_demana_viatger',
    p_event_id,
    jsonb_build_object('de', v_abans, 'a', p_demana, 'esborrades', v_esborrades)
  );

  return v_esborrades;
end $fn$;

comment on function public.admin_set_demana_viatger(uuid, boolean) is
  'Marca o desmarca si un esdeveniment demana dades de viatger. Desmarcar-la '
  'esborra les que ja hi havia i en torna el nombre. Nomes la junta. Auditat.';

alter function public.admin_set_demana_viatger(uuid, boolean) owner to postgres;
revoke all on function public.admin_set_demana_viatger(uuid, boolean) from public, anon;
grant execute on function public.admin_set_demana_viatger(uuid, boolean) to authenticated;

-- ── qui les ha posat ───────────────────────────────────────────────────────
-- La llista de la pantalla de la junta: qui hi va, en quin estat, i si les té
-- posades. CAP DADA DEL REGISTRE, i per això no s'audita: és el mateix que
-- veuria a la llista d'assistents, més un booleà.
create or replace function public.admin_viatgers(p_event_id uuid)
returns table (
  user_id        uuid,
  nombre         text,
  estado         text,
  te_dades       boolean,
  actualitzat_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  return query
  select a.user_id, p.nombre, a.estado, v.user_id is not null, v.updated_at
    from public.attendances a
    join public.profiles p on p.id = a.user_id
    left join public.dades_viatger v
      on v.event_id = a.event_id and v.user_id = a.user_id
   where a.event_id = p_event_id
     and private.esta_apuntat(a.estado)
   order by p.nombre;
end $fn$;

comment on function public.admin_viatgers(uuid) is
  'Qui esta apuntat a un esdeveniment i si ha posat les dades de viatger, '
  'sense cap de les dades. Nomes la junta.';

alter function public.admin_viatgers(uuid) owner to postgres;
revoke all on function public.admin_viatgers(uuid) from public, anon;
grant execute on function public.admin_viatgers(uuid) to authenticated;

-- ── les dades, per a la junta ──────────────────────────────────────────────
-- L'ÚNICA PORTA. Només les de qui té plaça (`si`, o `asistio` si ja és dins):
-- a l'allotjament s'hi envia qui hi dormirà, no qui espera o qui encara no
-- s'ha decidit. Les que ja han caducat i la purga encara no ha passat tampoc
-- no surten.
--
-- LA CONSULTA I L'AUDITORIA SÓN EL MATEIX CONJUNT. Els `id` es prenen primer,
-- s'escriuen al registre i després es torna exactament això: el registre no pot
-- dir una persona de menys ni de més del que s'ha vist.
--
-- `p_exporta` és el que la pantalla diu que fa —mirar-les o treure'n un
-- fitxer— i va al registre tal qual. És una declaració, no una garantia: qui
-- les mira les pot copiar igualment.
create or replace function public.admin_dades_viatgers(p_event_id uuid, p_exporta boolean)
returns table (
  user_id            uuid,
  nom                text,
  cognom1            text,
  cognom2            text,
  sexe               text,
  tipus_document     text,
  numero_document    text,
  numero_suport      text,
  nacionalitat       text,
  data_naixement     date,
  adreca             text,
  localitat          text,
  pais               text,
  telefon_emergencia text
)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_persones uuid[];
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(v.user_id), '{}') into v_persones
    from public.dades_viatger v
    join public.attendances a
      on a.event_id = v.event_id and a.user_id = v.user_id
   where v.event_id = p_event_id
     and a.estado in ('si', 'asistio')
     and private.viatger_caduca(p_event_id) > now();

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'consulta_viatgers',
    p_event_id,
    jsonb_build_object(
      'exporta', coalesce(p_exporta, false),
      'persones', to_jsonb(v_persones)
    )
  );

  return query
  select v.user_id, v.nom, v.cognom1, v.cognom2, v.sexe, v.tipus_document,
         v.numero_document, v.numero_suport, v.nacionalitat, v.data_naixement,
         v.adreca, v.localitat, v.pais, v.telefon_emergencia
    from public.dades_viatger v
   where v.event_id = p_event_id
     and v.user_id = any (v_persones)
   order by v.cognom1, v.cognom2 nulls first, v.nom;
end $fn$;

comment on function public.admin_dades_viatgers(uuid, boolean) is
  'Les dades de viatger de qui te placa a un esdeveniment. L''unica manera que '
  'la junta les llegeixi. Escriu a audit_log qui, quan, de qui i si s''han '
  'exportat, sense cap de les dades.';

alter function public.admin_dades_viatgers(uuid, boolean) owner to postgres;
revoke all on function public.admin_dades_viatgers(uuid, boolean) from public, anon;
grant execute on function public.admin_dades_viatgers(uuid, boolean) to authenticated;

-- ── la purga ───────────────────────────────────────────────────────────────
create or replace function private.purga_dades_viatger()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_deleted integer := 0;
begin
  delete from public.dades_viatger v
   where private.viatger_caduca(v.event_id) <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $fn$;

comment on function private.purga_dades_viatger() is
  'Esborra les dades de viatger dels esdeveniments que van acabar fa mes de '
  'set dies. Cada hora per pg_cron. No la crida ningu mes.';

alter function private.purga_dades_viatger() owner to postgres;
revoke all on function private.purga_dades_viatger() from public, anon, authenticated;

-- Cada hora, al minut 17 per no coincidir amb els altres jobs. Amb nom propi:
-- `cron.schedule` reemplaça un job amb el mateix nom.
select cron.schedule(
  'purga-dades-viatger',
  '17 * * * *',
  $$ select private.purga_dades_viatger() $$
);

-- ── i les dues accions noves al registre ───────────────────────────────────
-- La llista sencera, com a la 87: la migració més nova que la declara la porta
-- tota.
alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'avis',
    'avis_pendent',
    'award_points',
    'check_in_here',
    'close_meeting',
    'consulta_viatgers',
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
    'set_demana_viatger',
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

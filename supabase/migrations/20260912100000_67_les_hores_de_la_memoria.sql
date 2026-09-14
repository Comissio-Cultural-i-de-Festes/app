-- Les hores que compten per a la memòria de final de curs.
--
-- QUÈ DEMANA LA MEMÒRIA. Cada curs l'associació lliura a la universitat un
-- recompte d'hores de dedicació per persona. Fins ara surt d'un full de càlcul
-- que algú refà al juny mirant fotos i calendaris. Això ho posa a la base, on
-- ja hi ha qui va anar a què i a quina hora hi va entrar.
--
-- LA MARCA DIU ON ES FA, NO SI COMPTA. La memòria és de reconeixement acadèmic
-- i només recull el que passa DINS de la universitat. `tipo` no ho sap dir sol:
-- hi ha festes a la uni i festes que no, i activitats de totes dues menes. Per
-- això la columna es diu `a_la_uni` i no `compta_memoria` — el dia que la
-- universitat canviï què reconeix, el que canvia és la consulta, no el
-- significat de la columna.
--
-- UNA CASA RURAL NO POT ESTAR MARCADA, I HO DIU UN CHECK. Un cap de setmana no
-- són quaranta-vuit hores de voluntariat, i comptar-les faria la xifra
-- inservible. Això no és una casella que algú hagi de recordar de no marcar:
-- és una cosa que la base no deixa passar. La resta de tipus sí que són cosa de
-- la junta, acte per acte.
--
-- MINUTS SENCERS, NO HORES DECIMALS. Una reunió d'hora i mitja són 90 i no 1.5:
-- un `numeric` per a una quantitat que sempre és múltiple de cinc convida a
-- arrossegar errors de coma dins d'una suma que acaba en un document oficial.
-- Les hores són presentació i es fan al client.
--
-- COLUMNES A `events` I NO UNA TAULA A PART. Quantes hores val un vespre és una
-- propietat del vespre, exactament com `cal_confirmacio` (migració 27) i
-- `te_cotxes` (31), i es resol igual. La taula a part que es va considerar
-- demanaria una fila creada mandrosament, una funció que fusiona el que hi ha
-- amb el que es dedueix, i una política que no pot disparar mai —que és el que
-- la migració 36 va evitar posant `event_geo` a `private`.
--
-- I SÍ: UNA COLUMNA A `events` LA LLEGEIX TOTHOM, INCLÒS QUI ESPERA L'ALTA.
-- És la regla de la migració 36 i aquí s'accepta a posta. El que es publica és
-- «aquesta activitat val 180 minuts i es fa a la uni», que diu estrictament
-- menys que `tipo` i `puntos`, que ja hi són i ja surten a `events_public`. I
-- només arriba a files que el soci ja pot llegir: `events_select_member` demana
-- `published` i `abast <> 'junta'`.
--
-- `minuts_memoria` ÉS UNA FOTOGRAFIA, NO UNA DERIVACIÓ. Es calcula un sol cop,
-- en crear l'esdeveniment, de `starts_at` a `ends_at`, i a partir d'aquí només
-- la mou una persona. El mateix que ja fa `puntos`: «Changing the scale later
-- must never restate what an evening that already happened was worth». El que
-- es descarta és deduir-la de `event_details.ends_at` a cada lectura: l'hora de
-- final és informació per als socis i s'edita per raons que no tenen res a
-- veure amb això, i el dia que algú n'afegís una a l'octubre passat, la memòria
-- JA LLIURADA es reescriuria sola.
--
-- QUI FA QUANTES HORES. `private.minuts_persona` i prou. És l'únic lloc del
-- sistema que sap la regla, i el perfil i la junta hi criden tots dos:
--
--   1. Si la junta ha posat una excepció per a aquella persona, guanya.
--   2. Si no hi ha ni entrada ni sortida, la persona fa les hores senceres de
--      l'esdeveniment. És el cas d'una reunió tancada amb `admin_close_meeting`
--      —que marca l'assistència sense fitxar ningú— i el de qui tria no fer-se
--      cap de les dues fotos.
--   3. Amb les dues marques, manen elles: de l'entrada a la sortida. Qui arriba
--      a la meitat no ha fet les mateixes hores que qui hi és des del principi,
--      que és exactament el que demanava l'issue. I **no es retalla contra
--      l'horari previst**: un muntatge convocat de quatre hores que se n'allarga
--      cinc són cinc hores, i el número que hi ha a `minuts_memoria` és el
--      previst, no un sostre.
--   4. Amb una marca de sola —entrada i cap sortida, o al revés— la funció torna
--      **NULL**. Una sola marca no diu quanta estona va ser-hi, i NULL no és
--      zero: vol dir «encara no ho sabem». És el que deixa que la pantalla de
--      junta hi posi un guionet i demani a algú que ho miri, en lloc d'inventar
--      una hora de sortida que ningú no ha vist. Les sumes ignoren els NULL, o
--      sigui que aquella persona no suma fins que la junta ho corregeix.
--
-- EL VISAT. Mentre la junta no ha mirat les hores d'un esdeveniment, al perfil
-- surten marcades de provisionals. Tocar els minuts o la marca el treu: visar
-- una xifra i canviar-la després no la pot deixar visada.
--
-- ELS ESDEVENIMENTS D'ÀMBIT JUNTA COMPTEN COM TOTS ELS ALTRES. És feina, i la
-- memòria és de feina feta. La conseqüència que s'accepta a ulls oberts:
-- `my_hores()` és `security definer` i per tant torna el TÍTOL d'una reunió de
-- junta a qui hi consta com a assistent, encara que `etitle_select_member`
-- (migració 48) el tapi per a tothom. És el nom d'una cosa on la persona hi era,
-- i el conjunt de qui rep aquesta fila és exactament el conjunt de qui hi va
-- ser. La prova 440 ho fixa perquè el dia que canviï es vegi.
--
-- EL CURS ÉS LA FILA `mena = 'global'`, I NO N'HI HA CAP DE GARANTIDA. El CHECK
-- de la migració 24 no diu que n'hi hagi d'haver exactament una, i
-- `admin_save_periods` esborra les files que no li arriben. Per tant el
-- resolutor tria amb `order by ordre, codi limit 1` —determinista— i, quan no
-- n'hi ha cap, no torna cap fila: els límits es queden a NULL, la finestra és
-- oberta, i les dues dates viatgen dins la resposta perquè la pantalla ho pugui
-- DIR. Un total de curs que es converteix en silenci en un total de sempre és
-- el forat que la migració 11 descriu per al rànquing; aquí es fa visible.
--
-- CAP ÍNDEX NOU. `my_hores()` filtra per `attendances.user_id`, que és la
-- primera columna de l'índex únic `(user_id, event_id)`. El resum de junta
-- recorre un centenar d'esdeveniments i dos-cents socis un cop cada juny.

-- ── les columnes ────────────────────────────────────────────────────────────
alter table public.events
  add column a_la_uni            boolean not null default false,
  add column minuts_memoria      int     not null default 0,
  add column hores_verificat_at  timestamptz,
  add column hores_verificat_per uuid references public.profiles (id) on delete set null;

alter table public.events
  add constraint events_minuts_memoria_check
    check (minuts_memoria between 0 and 4320),
  add constraint events_casa_rural_mai_a_la_uni
    check (not a_la_uni or tipo <> 'casa_rural');

comment on column public.events.a_la_uni is
  'Si l''activitat es fa dins de la universitat, que es l''unica cosa que compta '
  'per a la memoria de final de curs. Una casa rural no ho pot ser mai, i ho diu '
  'el CHECK, no una casella.';
comment on column public.events.minuts_memoria is
  'Quant dura l''activitat, en minuts, per al recompte d''hores. Es calcula un '
  'sol cop en crear-la i a partir d''aqui nomes la mou la junta: una memoria ja '
  'lliurada no es pot reescriure sola perque algu toqui l''horari.';
comment on column public.events.hores_verificat_at is
  'Quan la junta va visar aquestes hores. NULL vol dir provisional, i aixi '
  'surten al perfil.';

-- El límit és el mateix a totes dues taules: 4320 minuts són tres dies, prou
-- per a una casa rural i prou poc per aturar un zero de més.
alter table public.attendances
  add column minuts_memoria int;

alter table public.attendances
  add constraint attendances_minuts_memoria_check
    check (minuts_memoria is null or minuts_memoria between 0 and 4320);

comment on column public.attendances.minuts_memoria is
  'L''excepcio: les hores d''aquesta persona en aquesta activitat quan no son '
  'les que surten del calcul. NULL vol dir «el que digui el calcul». Neix '
  'invisible per al client, perque els grants de columna de la migracio 34 '
  'nomes deixen llegir una llista tancada de columnes d''aquesta taula.';

-- ── els defectes, en un sol lloc ────────────────────────────────────────────
-- Afegir un cinquè tipus d'esdeveniment és tocar aquestes dues funcions i res
-- més.
create or replace function private.memoria_a_la_uni_defecte(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  -- Les reunions i les activitats es fan gairebé sempre a la facultat; les
  -- festes gairebé mai. El defecte és el que menys vegades caldrà desfer, i la
  -- junta el pot girar des del formulari.
  select p_tipo in ('reunio', 'actividad')
$fn$;

create or replace function private.memoria_minuts(
  p_tipo      text,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
)
returns int
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select least(4320, coalesce(
    -- L'horari, quan n'hi ha i té sentit.
    case when p_ends_at > p_starts_at
         then floor(extract(epoch from (p_ends_at - p_starts_at)) / 60)::int
    end,
    -- I si no, el que dura normalment una cosa d'aquestes. Serveix per repescar
    -- el que ja hi havia: des d'ara `admin_save_event` exigeix l'hora de final.
    case p_tipo
      when 'reunio'    then 60
      when 'actividad' then 120
      when 'fiesta'    then 240
      else 0
    end
  ))
$fn$;

-- ── la regla, que viu una sola vegada ───────────────────────────────────────
create or replace function private.minuts_persona(
  p_starts_at     timestamptz,
  p_minuts_event  int,
  p_checked_in_at timestamptz,
  p_exit_photo_at timestamptz,
  p_override      int
)
returns int
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select case
    -- La junta ha dit una xifra per a aquesta persona. No se'n discuteix.
    when p_override is not null then
      least(greatest(p_override, 0), 4320)
    -- Ni entrada ni sortida: hi era, i prou. Una reunió tancada des del panell
    -- no fitxa ningú, i fer-se les fotos és voluntari.
    when p_checked_in_at is null and p_exit_photo_at is null then
      coalesce(p_minuts_event, 0)
    -- Les dues marques manen, també quan diuen més que l'horari previst: un
    -- muntatge que s'allarga són les hores que s'hi ha estat.
    when p_checked_in_at is not null and p_exit_photo_at is not null then
      least(greatest(
        floor(extract(epoch from (p_exit_photo_at - p_checked_in_at)) / 60)::int,
        0
      ), 4320)
    -- Una marca de sola no diu prou. NULL i no zero: zero voldria dir «no hi va
    -- fer res», i el que passa és que no ho sabem.
    else null
  end
$fn$;

comment on function private.minuts_persona(timestamptz, int, timestamptz, timestamptz, int) is
  'Quants minuts ha fet una persona en una activitat, o NULL quan no es pot '
  'saber. L''unic lloc on viu la regla: l''excepcio de la junta guanya, sense '
  'cap marca es fan les hores senceres, amb les dues marques manen elles, i amb '
  'una de sola torna NULL perque encara no ho sap ningu.';

-- ── quin curs ───────────────────────────────────────────────────────────────
create or replace function private.periode_curs()
returns table (des_de timestamptz, fins_a timestamptz)
language sql
stable
security definer
parallel safe
set search_path = ''
as $fn$
  select rp.starts_at, rp.ends_at
    from public.ranking_periods rp
   where rp.mena = 'global'
   order by rp.ordre, rp.codi
   limit 1
$fn$;

comment on function private.periode_curs() is
  'La finestra del curs, de `ranking_periods`. Definer perque els dos qui la '
  'criden ja tenen la seva propia porta. Sense cap fila no torna res, i qui la '
  'crida es queda amb els dos limits a NULL: finestra oberta, i que ho digui la '
  'pantalla.';

-- ── el que veu el soci ──────────────────────────────────────────────────────
create or replace function public.my_hores()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me      uuid := (select auth.uid());
  v_des_de  timestamptz;
  v_fins_a  timestamptz;
  v_minuts  int;
  v_prov    int;
  v_quantes int;
  v_files   jsonb;
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

  with files as (
    select e.id                              as event_id,
           t.titulo                          as titol,
           e.starts_at                       as starts_at,
           e.tipo                            as tipo,
           e.hores_verificat_at is not null  as verificat,
           private.minuts_persona(
             e.starts_at, e.minuts_memoria,
             a.checked_in_at, a.exit_photo_at, a.minuts_memoria
           )                                 as minuts
      from public.attendances a
      join public.events e on e.id = a.event_id
      left join public.event_title t on t.event_id = e.id
     where a.user_id = v_me
       and a.estado = 'asistio'
       and e.a_la_uni
       and (v_des_de is null or e.starts_at >= v_des_de)
       and (v_fins_a is null or e.starts_at <  v_fins_a)
  )
  select coalesce(sum(f.minuts), 0)::int,
         coalesce(sum(f.minuts) filter (where not f.verificat), 0)::int,
         count(*)::int,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'event_id',  f.event_id,
               'titol',     f.titol,
               'starts_at', f.starts_at,
               'tipo',      f.tipo,
               'minuts',    f.minuts,
               'verificat', f.verificat
             )
             order by f.starts_at desc
           ),
           '[]'::jsonb
         )
    into v_minuts, v_prov, v_quantes, v_files
    from files f;

  return jsonb_build_object(
    'des_de',              v_des_de,
    'fins_a',              v_fins_a,
    'minuts',              v_minuts,
    'minuts_provisionals', v_prov,
    'quantes',             v_quantes,
    'files',               v_files
  );
end $fn$;

comment on function public.my_hores() is
  'Les teves hores del curs per a la memoria: el total, quantes encara son '
  'provisionals, i el desglossament per activitat. Nomes les que es fan a la '
  'uni i on consta que hi vas ser. Els dos limits del curs tornen amb la '
  'resposta perque la pantalla pugui dir de quan a quan compta.';

alter function public.my_hores() owner to postgres;
revoke all on function public.my_hores() from public, anon;
grant execute on function public.my_hores() to authenticated, service_role;

-- ── el que veu la junta d'un esdeveniment ───────────────────────────────────
create or replace function public.admin_hores_esdeveniment(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_event    public.events%rowtype;
  v_titol    text;
  v_visat    text;
  v_gent     jsonb;
  v_persones int;
  v_totals   int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event from public.events e where e.id = p_event_id;
  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  select t.titulo into v_titol from public.event_title t where t.event_id = p_event_id;
  select p.nombre into v_visat from public.profiles p where p.id = v_event.hores_verificat_per;

  -- `minuts_calcul` és la mateixa regla amb l'excepció treta. És el que fa que
  -- la pantalla pugui dir «el càlcul deia 4 h» al costat d'un número posat a
  -- mà, que és exactament el que la junta es pregunta quan el veu.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'user_id',       g.id,
               'nombre',        g.nombre,
               'avatar_url',    g.avatar_url,
               'checked_in_at', g.checked_in_at,
               'exit_photo_at', g.exit_photo_at,
               'minuts',        g.minuts,
               'minuts_calcul', g.minuts_calcul,
               'excepcio',      g.excepcio
             )
             order by g.nombre
           ),
           '[]'::jsonb
         ),
         count(*)::int,
         coalesce(sum(g.minuts), 0)::int
    into v_gent, v_persones, v_totals
    from (
      select p.id, p.nombre, p.avatar_url,
             a.checked_in_at, a.exit_photo_at,
             a.minuts_memoria is not null as excepcio,
             private.minuts_persona(
               v_event.starts_at, v_event.minuts_memoria,
               a.checked_in_at, a.exit_photo_at, a.minuts_memoria
             ) as minuts,
             private.minuts_persona(
               v_event.starts_at, v_event.minuts_memoria,
               a.checked_in_at, a.exit_photo_at, null
             ) as minuts_calcul
        from public.attendances a
        join public.profiles p on p.id = a.user_id
       where a.event_id = p_event_id
         and a.estado = 'asistio'
    ) g;

  return jsonb_build_object(
    'event_id',      v_event.id,
    'titol',         v_titol,
    'tipo',          v_event.tipo,
    'starts_at',     v_event.starts_at,
    'ends_at',       (select d.ends_at from public.event_details d where d.event_id = p_event_id),
    'minuts',        v_event.minuts_memoria,
    'a_la_uni',      v_event.a_la_uni,
    'pot_ser_uni',   v_event.tipo <> 'casa_rural',
    'visat_at',      v_event.hores_verificat_at,
    'visat_per',     v_visat,
    'persones',      v_persones,
    'minuts_totals', v_totals,
    'gent',          v_gent
  );
end $fn$;

comment on function public.admin_hores_esdeveniment(uuid) is
  'Les hores d''una activitat vistes per la junta: quant val, si es a la uni, si '
  'esta visada, i una fila per assistent amb els minuts efectius i si son una '
  'excepcio.';

alter function public.admin_hores_esdeveniment(uuid) owner to postgres;
revoke all on function public.admin_hores_esdeveniment(uuid) from public, anon;
grant execute on function public.admin_hores_esdeveniment(uuid) to authenticated;

-- ── i el resum del curs, soci per soci ──────────────────────────────────────
-- La porta va dins del WHERE i no en un `raise`, que és l'idioma de
-- `ranking_period`: qui no és de la junta rep zero files. I la finestra va dins
-- del JOIN i no del WHERE, o si no els socis amb zero hores —que són
-- precisament els que la memòria ha de poder ensenyar— desapareixerien de la
-- taula.
--
-- `hide_from_ranking` NO s'hi aplica a posta: amagar-se del rànquing és una
-- preferència social, i això és un document que es lliura a la universitat.
create or replace function public.admin_hores_socis()
returns table (
  user_id             uuid,
  nombre              text,
  avatar_url          text,
  escola              text,
  curs                int,
  minuts              int,
  minuts_provisionals int,
  quantes             int
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with w as (
    select (select pc.des_de from private.periode_curs() pc) as des_de,
           (select pc.fins_a from private.periode_curs() pc) as fins_a
  )
  select p.id,
         p.nombre,
         p.avatar_url,
         p.escola,
         p.curs,
         coalesce(sum(
           private.minuts_persona(
             e.starts_at, e.minuts_memoria,
             a.checked_in_at, a.exit_photo_at, a.minuts_memoria
           )
         ) filter (where e.id is not null), 0)::int,
         coalesce(sum(
           private.minuts_persona(
             e.starts_at, e.minuts_memoria,
             a.checked_in_at, a.exit_photo_at, a.minuts_memoria
           )
         ) filter (where e.id is not null and e.hores_verificat_at is null), 0)::int,
         count(e.id)::int
    from w
    cross join public.profiles p
    left join public.attendances a
      on a.user_id = p.id
     and a.estado = 'asistio'
    left join public.events e
      on e.id = a.event_id
     and e.a_la_uni
     and (w.des_de is null or e.starts_at >= w.des_de)
     and (w.fins_a is null or e.starts_at <  w.fins_a)
   where p.estat = 'actiu'
     and (select private.is_admin())
   group by p.id, p.nombre, p.avatar_url, p.escola, p.curs
   order by 6 desc, p.nombre
$fn$;

comment on function public.admin_hores_socis() is
  'El recompte del curs soci per soci, que es el que va a la memoria. Hi surt '
  'tothom qui es actiu, tambe qui te zero hores.';

alter function public.admin_hores_socis() owner to postgres;
revoke all on function public.admin_hores_socis() from public, anon;
grant execute on function public.admin_hores_socis() to authenticated;

-- ── i què queda per visar ───────────────────────────────────────────────────
-- La seva pròpia RPC i no un camp del resum, perquè la llegeixen dos llocs: la
-- línia ambre de la pantalla d'hores i la fila del rebedor de la junta. Un camp
-- dins d'`admin_hores_socis` obligaria el rebedor a demanar dues-centes files de
-- socis per ensenyar un número.
--
-- NOMÉS EL QUE JA HA PASSAT. Una activitat de la setmana que ve no està
-- pendent de visar: encara no s'ha fet. Comptar-la faria que la feina no
-- s'acabés mai i que el número no volgués dir res.
create or replace function public.admin_hores_pendents()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_des_de timestamptz;
  v_fins_a timestamptz;
  v_acts   int;
  v_minuts int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select pc.des_de, pc.fins_a into v_des_de, v_fins_a from private.periode_curs() pc;

  with pendents as (
    select e.id, e.starts_at, e.minuts_memoria
      from public.events e
     where e.a_la_uni
       and e.hores_verificat_at is null
       and e.starts_at < now()
       and (v_des_de is null or e.starts_at >= v_des_de)
       and (v_fins_a is null or e.starts_at <  v_fins_a)
  )
  select count(distinct p.id)::int,
         coalesce(sum(
           private.minuts_persona(
             p.starts_at, p.minuts_memoria,
             a.checked_in_at, a.exit_photo_at, a.minuts_memoria
           )
         ), 0)::int
    into v_acts, v_minuts
    from pendents p
    left join public.attendances a
      on a.event_id = p.id
     and a.estado = 'asistio';

  return jsonb_build_object('activitats', v_acts, 'minuts', v_minuts);
end $fn$;

comment on function public.admin_hores_pendents() is
  'Quantes activitats d''aquest curs ja fetes encara no tenen les hores '
  'visades, i quantes hores de gent hi ha en joc. La feina que li queda a la '
  'junta abans de tancar la memoria.';

alter function public.admin_hores_pendents() owner to postgres;
revoke all on function public.admin_hores_pendents() from public, anon;
grant execute on function public.admin_hores_pendents() to authenticated;

-- ── i el que la junta pot canviar ───────────────────────────────────────────
-- Tres RPC i no una amb tres banderes: la durada, el visat i l'excepció d'una
-- persona són tres decisions diferents, es prenen des de llocs diferents i han
-- de deixar tres línies diferents al registre. És també per què no són
-- paràmetres nous d'`admin_save_event`: afegir-n'hi un amb valor per defecte
-- crea una sobrecàrrega i PostgREST contesta PGRST203, cosa que ja ha passat
-- tres vegades amb aquella funció (27, 32 i 48).
create or replace function public.admin_set_hores(
  p_event_id uuid,
  p_minuts   int,
  p_a_la_uni boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_tipo       text;
  v_was_minuts int;
  v_was_uni    boolean;
  v_was_visat  timestamptz;
  v_titol      text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_minuts is null or p_minuts < 0 or p_minuts > 4320 then
    raise exception 'minuts invalids' using errcode = '22023';
  end if;
  if p_a_la_uni is null then
    raise exception 'cal dir si es a la uni' using errcode = '22023';
  end if;

  -- Bloquejada abans de llegir-la, com a `admin_set_published`: dos admins que
  -- la toquen alhora no poden apuntar-se tots dos el mateix canvi.
  select e.tipo, e.minuts_memoria, e.a_la_uni, e.hores_verificat_at
    into v_tipo, v_was_minuts, v_was_uni, v_was_visat
    from public.events e
   where e.id = p_event_id
     for update;

  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  -- El CHECK ja ho impediria, però un 23514 no es pot ensenyar a ningú.
  if p_a_la_uni and v_tipo = 'casa_rural' then
    raise exception 'una casa rural no es a la uni' using errcode = '22023';
  end if;

  -- Ni fila ni línia al registre quan no canvia res: un doble toc no són dues
  -- decisions.
  if v_was_minuts = p_minuts and v_was_uni = p_a_la_uni then
    return;
  end if;

  select t.titulo into v_titol from public.event_title t where t.event_id = p_event_id;

  update public.events
     set minuts_memoria      = p_minuts,
         a_la_uni            = p_a_la_uni,
         -- Visar una xifra i canviar-la després no la pot deixar visada.
         hores_verificat_at  = null,
         hores_verificat_per = null
   where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'set_hores',
    p_event_id,
    jsonb_build_object(
      'titulo',       v_titol,
      'de_minuts',    v_was_minuts,
      'a_minuts',     p_minuts,
      'de_uni',       v_was_uni,
      'a_uni',        p_a_la_uni,
      'visat_perdut', v_was_visat is not null
    )
  );
end $fn$;

comment on function public.admin_set_hores(uuid, int, boolean) is
  'Quant val una activitat per a la memoria i si es fa a la uni. Treu el visat, '
  'perque una xifra visada que canvia deixa de ser-ho.';

alter function public.admin_set_hores(uuid, int, boolean) owner to postgres;
revoke all on function public.admin_set_hores(uuid, int, boolean) from public, anon;
grant execute on function public.admin_set_hores(uuid, int, boolean) to authenticated;

create or replace function public.admin_visa_hores(p_event_id uuid, p_visat boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_was   timestamptz;
  v_titol text;
  v_vol   boolean := coalesce(p_visat, false);
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select e.hores_verificat_at into v_was
    from public.events e
   where e.id = p_event_id
     for update;

  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  if (v_was is not null) = v_vol then
    return;
  end if;

  select t.titulo into v_titol from public.event_title t where t.event_id = p_event_id;

  update public.events
     set hores_verificat_at  = case when v_vol then now() end,
         hores_verificat_per = case when v_vol then (select auth.uid()) end
   where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'visa_hores',
    p_event_id,
    jsonb_build_object('titulo', v_titol, 'visat', v_vol)
  );
end $fn$;

comment on function public.admin_visa_hores(uuid, boolean) is
  'Visa les hores d''una activitat, o els treu el visat. Mentre no esta visada, '
  'al perfil de cadascu surten com a provisionals.';

alter function public.admin_visa_hores(uuid, boolean) owner to postgres;
revoke all on function public.admin_visa_hores(uuid, boolean) from public, anon;
grant execute on function public.admin_visa_hores(uuid, boolean) to authenticated;

create or replace function public.admin_set_hores_persona(
  p_event_id uuid,
  p_user_id  uuid,
  p_minuts   int
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_was   int;
  v_titol text;
  v_visat timestamptz;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_minuts is not null and (p_minuts < 0 or p_minuts > 4320) then
    raise exception 'minuts invalids' using errcode = '22023';
  end if;

  -- Per sota d'un visat no s'hi toca. Canviar la durada de l'activitat sencera
  -- el treu —és un sol acte deliberat i la pantalla on es fa ho ensenya—, però
  -- les hores d'una persona s'editen a la pantalla que diu «Visat el 14
  -- d'octubre per l'Alfa», i moure-les des d'allà canviaria en silenci un
  -- número que algú ja ha signat. Primer es desfà el vist.
  select e.hores_verificat_at into v_visat
    from public.events e
   where e.id = p_event_id;

  if v_visat is not null then
    raise exception 'les hores ja estan visades' using errcode = 'P0001';
  end if;

  select a.minuts_memoria into v_was
    from public.attendances a
   where a.event_id = p_event_id
     and a.user_id = p_user_id
     and a.estado = 'asistio'
     for update;

  if not found then
    raise exception 'no consta que hi fos' using errcode = 'P0002';
  end if;

  if v_was is not distinct from p_minuts then
    return;
  end if;

  select t.titulo into v_titol from public.event_title t where t.event_id = p_event_id;

  update public.attendances
     set minuts_memoria = p_minuts
   where event_id = p_event_id and user_id = p_user_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'hores_persona',
    p_event_id,
    jsonb_build_object('titulo', v_titol, 'user_id', p_user_id, 'de', v_was, 'a', p_minuts)
  );
end $fn$;

comment on function public.admin_set_hores_persona(uuid, uuid, int) is
  'Les hores d''una persona concreta en una activitat, quan no son les del '
  'calcul: qui arriba a la meitat, qui es queda a recollir. Amb NULL torna al '
  'que digui el calcul.';

alter function public.admin_set_hores_persona(uuid, uuid, int) owner to postgres;
revoke all on function public.admin_set_hores_persona(uuid, uuid, int) from public, anon;
grant execute on function public.admin_set_hores_persona(uuid, uuid, int) to authenticated;

-- ── crear un esdeveniment ja diu quant val ──────────────────────────────────
-- DROP I RECREAR, i no `create or replace`: afegir-hi un paràmetre amb valor
-- per defecte crearia una sobrecàrrega i PostgREST contestaria PGRST203. Ja ha
-- passat tres vegades amb aquesta funció (27, 32 i 48). Aquí la signatura no
-- canvia gens —els minuts i la marca no són paràmetres, se'n dedueixen— però
-- el cos sí, i el drop hi és perquè el `create` de sota es llegeixi sencer.
--
-- L'HORA DE FINAL PASSA A SER OBLIGATÒRIA. Sense ella no hi ha durada, i sense
-- durada no hi ha memòria. Val més refusar el desat que desar un esdeveniment
-- que valdrà zero hores i que ningú no tornarà a mirar. No hi ha `not null` a
-- `event_details.ends_at` perquè hi ha files antigues sense: la regla mira cap
-- endavant i la repesca de més avall s'ocupa del que ja hi havia.
--
-- ELS MINUTS I LA MARCA, NOMÉS EN CREAR. En editar no es toquen, exactament com
-- ja passa amb `puntos`: moure l'horari d'un esdeveniment que ja s'ha fet no pot
-- reescriure el que va valer. L'única excepció és canviar el tipus a
-- `casa_rural`, que apaga la marca — altrament el CHECK faria petar un desat
-- que des de la pantalla sembla innocent.
drop function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
);

create function public.admin_save_event(
  p_titulo text,
  p_tipo text,
  p_starts_at timestamptz,
  p_id uuid default null,
  p_plazas int default null,
  p_precio_cents int default 0,
  p_puntos int default null,
  p_teaser text default null,
  p_reveal_at timestamptz default null,
  p_published boolean default false,
  p_descripcion text default null,
  p_ubicacion text default null,
  p_ends_at timestamptz default null,
  p_cover_url text default null,
  p_transport_info text default null,
  p_cal_confirmacio boolean default false,
  p_te_cotxes boolean default false,
  p_abast text default 'comi'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id      uuid := p_id;
  v_puntos  int  := p_puntos;
  v_abast   text := coalesce(p_abast, 'comi');
  v_before  jsonb;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_tipo not in ('fiesta', 'casa_rural', 'actividad', 'reunio') then
    raise exception 'tipus invalid' using errcode = '22023';
  end if;
  if v_abast not in ('comi', 'junta') then
    raise exception 'abast invalid' using errcode = '22023';
  end if;
  -- L'àmbit només vol dir alguna cosa en una reunió. Una festa «només per a la
  -- junta» seria una cosa que ningú no ha dissenyat i que la pantalla no sap
  -- ensenyar; val més refusar-la que deixar-la mig feta.
  if v_abast = 'junta' and p_tipo <> 'reunio' then
    raise exception 'nomes una reunio pot ser d''abast junta' using errcode = '22023';
  end if;
  if btrim(coalesce(p_titulo, '')) = '' then
    raise exception 'cal un titol' using errcode = '22023';
  end if;
  -- Des de la 67: sense hora de final no hi ha hores per a la memòria.
  if p_ends_at is null then
    raise exception 'cal una hora de final' using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'l''hora de final ha de ser posterior a la d''inici' using errcode = '22023';
  end if;

  -- Only for a new event. Changing the scale later must never restate what an
  -- evening that already happened was worth.
  if v_puntos is null then
    select punts into v_puntos
      from public.point_values
     where mena = 'tipus_esdeveniment' and clau = p_tipo;
    v_puntos := coalesce(v_puntos, 10);
  end if;

  -- Una reunió de junta no reparteix punts, i per tant no en guarda: deixar-hi
  -- un número seria una promesa que en tancar-la no es compleix. Vegeu la nota
  -- de dalt.
  if v_abast = 'junta' then
    v_puntos := 0;
  end if;

  if v_id is null then
    insert into public.events (
      tipo, starts_at, plazas, precio_cents, puntos,
      teaser, reveal_at, published, cal_confirmacio, te_cotxes, abast, created_by,
      a_la_uni, minuts_memoria
    )
    values (
      p_tipo, p_starts_at, p_plazas, p_precio_cents, v_puntos,
      p_teaser, p_reveal_at, p_published, coalesce(p_cal_confirmacio, false),
      coalesce(p_te_cotxes, false), v_abast, (select auth.uid()),
      private.memoria_a_la_uni_defecte(p_tipo),
      private.memoria_minuts(p_tipo, p_starts_at, p_ends_at)
    )
    returning id into v_id;
  else
    select to_jsonb(e) into v_before from public.events e where e.id = v_id;
    if v_before is null then
      raise exception 'esdeveniment inexistent' using errcode = '42501';
    end if;

    update public.events set
      tipo = p_tipo, starts_at = p_starts_at,
      plazas = p_plazas, precio_cents = p_precio_cents, puntos = v_puntos,
      teaser = p_teaser, reveal_at = p_reveal_at, published = p_published,
      cal_confirmacio = coalesce(p_cal_confirmacio, false),
      te_cotxes = coalesce(p_te_cotxes, false),
      abast = v_abast,
      -- Ni els minuts ni la marca no es recalculen en editar: són una decisió
      -- ja presa. L'únic que canvia és que una casa rural no pot quedar
      -- marcada, perquè el CHECK no ho deixaria i l'error no seria llegible.
      a_la_uni = a_la_uni and p_tipo <> 'casa_rural'
    where id = v_id;
  end if;

  -- El titol a la seva taula i la resta a la seva, dins de la mateixa
  -- transaccio: el que no pot passar es que un esdeveniment quedi publicat amb
  -- titol i sense detalls, o al contrari.
  insert into public.event_title (event_id, titulo)
  values (v_id, btrim(p_titulo))
  on conflict (event_id) do update set titulo = excluded.titulo;

  insert into public.event_details (
    event_id, descripcion, ubicacion, ends_at, cover_url, transport_info
  )
  values (v_id, p_descripcion, p_ubicacion, p_ends_at, p_cover_url, p_transport_info)
  on conflict (event_id) do update set
    descripcion    = excluded.descripcion,
    ubicacion      = excluded.ubicacion,
    ends_at        = excluded.ends_at,
    cover_url      = excluded.cover_url,
    transport_info = excluded.transport_info;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    case when p_id is null then 'create_event' else 'edit_event' end,
    v_id,
    jsonb_build_object(
      'titulo', p_titulo, 'published', p_published, 'reveal_at', p_reveal_at,
      'cal_confirmacio', coalesce(p_cal_confirmacio, false),
      'te_cotxes', coalesce(p_te_cotxes, false),
      'tipo', p_tipo, 'abast', v_abast
    )
  );

  return v_id;
end $fn$;

comment on function public.admin_save_event is
  'One call for the event and its two reveal-gated halves. Since migration 48 '
  'it also takes the scope: only a reunio may be junta-scoped, and a '
  'junta-scoped one is stored with zero points because closing it awards none. '
  'Since 67 the end time is required, and creating an event also writes how '
  'many minutes it is worth for the end-of-year report and whether it happens '
  'at the university.';

alter function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) owner to postgres;
revoke all on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) from public, anon;
grant execute on function public.admin_save_event(
  text, text, timestamptz, uuid, int, int, int, text, timestamptz, boolean,
  text, text, timestamptz, text, text, boolean, boolean, text
) to authenticated;

-- ── la repesca del que ja hi havia ──────────────────────────────────────────
-- Els esdeveniments d'abans d'aquesta migració. Els que tenen hora de final
-- —que en producció són set dels vuit— en treuen la durada; l'únic que no en
-- té es queda amb el que dura normalment una cosa del seu tipus. Cap queda
-- visat, o sigui que tot això surt al perfil marcat de provisional fins que la
-- junta hi entri: és exactament el que ha de passar amb una xifra que ha posat
-- una migració i no una persona.
update public.events e
   set a_la_uni       = private.memoria_a_la_uni_defecte(e.tipo),
       minuts_memoria = private.memoria_minuts(e.tipo, e.starts_at, d.ends_at)
  from public.event_details d
 where d.event_id = e.id;

-- I els que ni tan sols tenen fila de detalls.
update public.events e
   set a_la_uni       = private.memoria_a_la_uni_defecte(e.tipo),
       minuts_memoria = private.memoria_minuts(e.tipo, e.starts_at, null)
 where not exists (select 1 from public.event_details d where d.event_id = e.id);

-- ── i la vista, amb les quatre columnes noves al final ──────────────────────
-- `create or replace view` només sap AFEGIR columnes, i afegir-les al final és
-- exactament el que es pot fer: així no cal el drop, i el drop se'n duria els
-- grants i tot el que la llegeix.
create or replace view public.events_public
with (security_invoker = true, security_barrier = true) as
select
  e.id,
  t.titulo,
  e.tipo,
  e.starts_at,
  e.teaser,
  e.reveal_at,
  (e.reveal_at is null or e.reveal_at <= now()) as revelat,
  e.plazas,
  e.precio_cents,
  e.puntos,
  e.published,
  e.created_by,
  e.created_at,
  d.descripcion,
  d.ubicacion,
  d.ends_at,
  d.cover_url,
  d.transport_info,
  e.cal_confirmacio,
  e.te_cotxes,
  e.abast,
  e.tancada_at,
  d.acta,
  -- Les quatre de la memòria. Van a `events` i no als detalls, o sigui que no
  -- les filtra la revelació: quant val una activitat i si es fa a la uni no és
  -- cap sorpresa que s'hagi de guardar.
  e.a_la_uni,
  e.minuts_memoria,
  e.hores_verificat_at,
  e.hores_verificat_per
from public.events e
left join public.event_title t on t.event_id = e.id
left join public.event_details d on d.event_id = e.id;

alter view public.events_public owner to postgres;

-- ── i les tres accions noves al registre ────────────────────────────────────
-- La migració 57 va tancar la llista amb un CHECK precisament perquè afegir una
-- acció obligui a tocar-la, i tocar-la faci fallar `tests/audit-actions.test.ts`
-- fins que hi ha etiqueta en català, castellà i anglès. Això és el segon cop que
-- es declara, i per això el test ha deixat de mirar un fitxer fix.
alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
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
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
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

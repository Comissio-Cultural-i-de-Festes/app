-- L'storage es buida: el que ja no apunta ningú, i les proves de la gimcana
-- trenta dies després de tancar-la.
--
-- EL QUE PASSAVA. Cap fitxer es netejava mai. Canviar d'avatar o de portada
-- deixava l'anterior al bucket (a producció ja n'hi havia dos d'orfes de vuit
-- avatars), esborrar un esdeveniment no en treia la portada, i les fotos de la
-- gimcana s'hi quedaven per sempre. Amb un curs normal són uns 0,8 GB l'any
-- sobre 1 GB compartit amb Staging, i quan s'omple les pujades fallen: la
-- gimcana d'una nit amb dues-centes persones és exactament quan passaria.
--
-- DUES MEITATS. La primera és al client: qui substitueix una foto (avatar,
-- portada, selfi de la porta) o esborra un esdeveniment esborra l'objecte vell
-- tot seguit, amb les polítiques que ja hi ha. Aquesta migració és la xarxa de
-- sota: diu què sobra, per si l'esborrat es va quedar sense cobertura a mig
-- camí, per als orfes que ja hi ha, i per a les proves de la gimcana.
--
-- QUÈ SOBRA, i ho decideix la base, que és l'única que ho sap:
--
--   · avatars: tot el que hi ha a la carpeta d'algú i no és el seu `avatar_url`.
--   · portades: tot el que hi ha a la carpeta d'un esdeveniment i no és el seu
--     `event_details.cover_url`, o la carpeta sencera si l'esdeveniment ja no
--     existeix.
--   · fotos de porta: les que no són l'`entry_photo_url` o l'`exit_photo_url` de
--     l'assistència de qui surt a la foto, a aquell esdeveniment.
--   · galeria: els objectes que cap fila d'`event_photos` no fa servir.
--   · gimcana: les fotos d'una prova que ja no existeix, i TOTES les d'una
--     gimcana tancada fa més de trenta dies. Decisió del mantenidor: la foto
--     serveix per validar la prova aquella nit, i el marcador no la necessita.
--
-- Amb un dia de marge a tot el que es decideix per «no hi apunta ningú»: entre
-- pujar un objecte i desar-ne el camí hi ha un instant —i la portada d'un
-- esdeveniment nou, dues crides— en què l'objecte és orfe sense ser brossa. A
-- les proves de la gimcana no s'aplica la regla de «ningú no hi apunta», perquè
-- allà sí que hi ha una cua fora de línia que puja la foto i envia la fila més
-- tard, i una casa rural de tres dies fa la finestra prou llarga perquè un dia
-- de marge no n'hi hagi prou. Un camí amb una forma que no s'entén no es toca:
-- el que no se sap llegir no se sap si sobra.
--
-- QUI L'ESBORRA. No pot ser la base: `storage.protect_delete()` refusa el
-- DELETE a `storage.objects` des de SQL, i saltar-se'l
-- (`storage.allow_delete_query`) seria pitjor, perquè esborraria la fila i
-- deixaria els bytes al disc de l'storage on ja no els trobaria ningú. L'objecte
-- s'ha de treure per l'API de Storage, i l'API demana algú amb permís.
--
-- Qui té permís ja hi és: cadascú sobre la seva carpeta d'avatar i les seves
-- fotos de porta, i la junta sobre les portades, les fotos d'entrada i les de
-- la gimcana (migracions 14, 35, 36, 40, 42). `my_storage_garbage()` torna, a
-- qui la crida, la brossa que les polítiques li deixen treure i res més, i
-- l'app la treu en segon pla com a molt un cop al dia per mòbil
-- (`src/lib/sweep.ts`). La foto d'una prova desapareix de Storage la primera
-- vegada que algú de la junta obre l'app passats els trenta dies: «sola» vol
-- dir que ningú no ho ha de demanar, no que passi sense que ningú obri l'app.
-- De la pantalla, en canvi, desapareix el dia trenta en punt (vegeu la cua, a
-- sota). Una gimcana gran són milers de fotos, i per això l'escombrada demana
-- de mil en mil i hi torna mentre la llista arribi plena.
--
-- DESCARTAT: `pg_cron` QUE DESPERTA UNA EDGE FUNCTION, com `reveal-push`. Seria
-- a les quatre de la matinada en punt i sense dependre de ningú, però esborrar
-- les carpetes de tothom vol la clau de servei dins de la funció, i aquest
-- repositori la té fora de `supabase/functions` a posta
-- (`tests/no-service-role.test.ts`): una credencial que se salta totes les
-- polítiques darrere d'un parser de TypeScript. A més, un secret nou, un
-- desplegament i dos passos al vault. El que costa haver-ho descartat: els bytes
-- es queden fins que obre l'app algú que els pot treure, i una foto de sortida
-- d'un esdeveniment esborrat —que la junta no pot ni llegir, a posta (migració
-- 35)— fins que l'obre qui hi surt.
--
-- DESCARTAT: LA CLAU DINS DEL VAULT i un `net.http_delete` des d'aquí. Faria
-- que la base guardés la clau que se salta totes les seves polítiques, a
-- l'abast de qualsevol funció definer que llegeixi el vault.
--
-- DESCARTAT: UNA POLÍTICA DE DELETE PER A `anon` LIMITADA A LA BROSSA. L'API de
-- Storage esborra amb un `DELETE … RETURNING`, i Postgres hi aplica també la
-- política de SELECT: hauria d'obrir la lectura de la brossa —cares d'avatars
-- vells i fotos de porta— a qualsevol que tingui la clau pública.
--
-- EL QUE QUEDA FORA: les fotos de galeria d'un esdeveniment esborrat. La
-- política de lectura d'aquell bucket demana un esdeveniment publicat, o sigui
-- que ningú no les pot treure per l'API. És un cas que gairebé no passa:
-- `admin_delete_event` refusa un esdeveniment amb punts, i per penjar-hi fotos
-- cal haver-hi fitxat.
--
-- AL MENYS UNA VEGADA. No hi ha cap estat: el que sobra es calcula cada vegada
-- a partir del que hi ha a `storage.objects`, i un objecte que no s'ha pogut
-- treure torna a sortir el dia següent. Treure dues vegades el mateix no fa mal.
--
-- LES FILES DE LA GIMCANA. `gimcana_enviaments.path` no és nul i es queda: diu
-- què es va enviar. Que la foto ja no compta es dedueix de l'horari, igual que
-- el que fa que sobri: la cua de validar torna `foto_esborrada_at` calculada
-- amb la mateixa `gimcana_tancada_a`, i la pantalla diu «la foto ja no hi és»
-- en comptes d'un requadre buit des del mateix instant que l'escombrada la pot
-- treure.
--
-- DESCARTAT: UNA COLUMNA A LA FILA MARCADA PER UN `cron`. Era la primera
-- versió, i deixava una finestra: entre l'escombrada de la junta i el `cron` de
-- les 4.10, la foto ja no hi era i la fila encara no ho deia. Dues fonts per a
-- la mateixa regla poden discrepar; una de sola, no. I l'estat que la columna
-- guardava es pot tornar a calcular sempre, perquè l'horari d'un esdeveniment
-- no s'esborra.

-- ── on es tanca una gimcana ─────────────────────────────────────────────────
-- Quan es tanca la finestra de `private.gimcana_is_open`, que és la de fitxar
-- (migració 36). Cap columna ho marca: es tanca sola amb l'horari.
create or replace function private.gimcana_tancada_a(p_event_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select upper(private.checkin_open_at(p_event_id)) at time zone 'UTC'
$$;

comment on function private.gimcana_tancada_a(uuid) is
  'Quan es tanca la gimcana d''un esdeveniment: el final de la finestra de '
  'fitxar, que és la mateixa que obre i tanca la gimcana.';

alter function private.gimcana_tancada_a(uuid) owner to postgres;
revoke all on function private.gimcana_tancada_a(uuid) from public, anon, authenticated;

-- Un uuid llegit d'un tros de camí, o null. Mateix motiu que
-- `private.avatar_owner`: un cast que peta dins d'una consulta sobre tot el
-- bucket faria fallar la neteja sencera per un sol nom estrany.
create or replace function private.uuid_or_null(p_text text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then p_text::uuid
  end
$$;

alter function private.uuid_or_null(text) owner to postgres;
revoke all on function private.uuid_or_null(text) from public, anon, authenticated;

-- ── què sobra ───────────────────────────────────────────────────────────────
create or replace function private.storage_garbage()
returns table (bucket text, path text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select o.bucket_id, o.name, o.created_at, storage.foldername(o.name) as f
    from storage.objects o
    where o.bucket_id in ('avatars', 'event-covers', 'door-photos', 'event-photos', 'gimcana-photos')
  )
  select o.bucket_id, o.name, o.created_at
  from o
  where (
    -- {uid}/{quan}.{ext}
    o.bucket_id = 'avatars'
    and array_length(o.f, 1) = 1
    and private.uuid_or_null(o.f[1]) is not null
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.profiles p
      where p.id = private.uuid_or_null(o.f[1]) and p.avatar_url = o.name
    )
  ) or (
    -- {esdeveniment}/{quan}.{ext}
    o.bucket_id = 'event-covers'
    and array_length(o.f, 1) = 1
    and private.uuid_or_null(o.f[1]) is not null
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.event_details d
      where d.event_id = private.uuid_or_null(o.f[1]) and d.cover_url = o.name
    )
    -- Cap pantalla escriu imatges a `event_content` avui, però la taula ho
    -- admet (`tipus = 'imatge'`), i una imatge que hi aparegui no és brossa.
    and not exists (
      select 1 from public.event_content c
      where c.event_id = private.uuid_or_null(o.f[1]) and strpos(c.cos::text, o.name) > 0
    )
  ) or (
    -- {entrada|sortida}/{esdeveniment}/{uid}/{quan}.{ext}
    o.bucket_id = 'door-photos'
    and array_length(o.f, 1) = 3
    and o.f[1] in ('entrada', 'sortida')
    and private.uuid_or_null(o.f[2]) is not null
    and private.uuid_or_null(o.f[3]) is not null
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.attendances a
      where a.event_id = private.uuid_or_null(o.f[2])
        and a.user_id = private.uuid_or_null(o.f[3])
        and o.name in (a.entry_photo_url, a.exit_photo_url)
    )
  ) or (
    -- {esdeveniment}/{uid}/{quan}.jpg i .thumb.jpg
    o.bucket_id = 'event-photos'
    and array_length(o.f, 1) = 2
    and private.uuid_or_null(o.f[1]) is not null
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.event_photos ph
      where ph.event_id = private.uuid_or_null(o.f[1])
        and o.name in (ph.path, ph.thumb_path)
    )
  ) or (
    -- {prova}/{uid}/{petició}.jpg
    o.bucket_id = 'gimcana-photos'
    and array_length(o.f, 1) = 2
    and private.uuid_or_null(o.f[1]) is not null
    and (
      (
        o.created_at < now() - interval '1 day'
        and not exists (
          select 1 from public.gimcana_proves pr where pr.id = private.uuid_or_null(o.f[1])
        )
      )
      or exists (
        select 1
        from public.gimcana_proves pr
        join public.gimcanes g on g.id = pr.gimcana_id
        where pr.id = private.uuid_or_null(o.f[1])
          and private.gimcana_tancada_a(g.event_id) < now() - interval '30 days'
      )
    )
  )
$$;

comment on function private.storage_garbage() is
  'Tots els objectes que sobren: el que no apunta cap fila (passat un dia) i '
  'les proves d''una gimcana tancada fa més de trenta dies. No la crida ningú '
  'de fora: my_storage_garbage() en dona a cadascú la part que pot treure.';

alter function private.storage_garbage() owner to postgres;
revoke all on function private.storage_garbage() from public, anon, authenticated;

-- ── i la part de cadascú ────────────────────────────────────────────────────
-- Cada condició és la política de DELETE del bucket i la de SELECT que l'API
-- de Storage també aplica, escrites al revés: tornar un camí que després
-- l'esborrat no pot treure seria una crida perduda cada dia per sempre.
create or replace function public.my_storage_garbage(p_limit integer default 200)
returns table (bucket text, path text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.bucket, g.path
  from private.storage_garbage() g
  cross join lateral (select storage.foldername(g.path) as f) p
  where (select private.is_active_member())
    and (
      -- La teva carpeta d'avatar (migració 42).
      (g.bucket = 'avatars'
        and private.uuid_or_null(p.f[1]) = (select auth.uid()))
      -- Les teves fotos de porta, les dues meitats (35 i 36); i la junta, les
      -- d'entrada de tothom (14 i 35). Les de sortida d'un altre, mai.
      or (g.bucket = 'door-photos'
        and (private.uuid_or_null(p.f[3]) = (select auth.uid())
             or (p.f[1] = 'entrada' and (select private.is_admin()))))
      -- Les portades i les proves de la gimcana, la junta (14 i 40).
      or (g.bucket in ('event-covers', 'gimcana-photos') and (select private.is_admin()))
      -- La galeria, qui la va penjar o la junta, i només d'un esdeveniment que
      -- encara es pot llegir (39 i 56).
      or (g.bucket = 'event-photos'
        and (private.uuid_or_null(p.f[2]) = (select auth.uid()) or (select private.is_admin()))
        and private.event_is_published(private.uuid_or_null(p.f[1]))
        and private.event_is_visible_to_caller(private.uuid_or_null(p.f[1])))
    )
  order by g.created_at
  limit greatest(coalesce(p_limit, 200), 0)
$$;

comment on function public.my_storage_garbage(integer) is
  'La brossa de Storage que qui crida pot treure amb les seves polítiques: la '
  'seva carpeta d''avatar i les seves fotos de porta, i per a la junta també '
  'portades, fotos d''entrada i proves de la gimcana. L''app la treu en segon '
  'pla un cop al dia; la base només diu què.';

alter function public.my_storage_garbage(integer) owner to postgres;
revoke all on function public.my_storage_garbage(integer) from public, anon;
grant execute on function public.my_storage_garbage(integer) to authenticated;

-- ── la cua de validar diu si la foto ja no hi és ────────────────────────────
-- Cal DROP: canviar les columnes d'un `returns table` no es pot fer amb
-- replace. La columna nova va al final, perquè un mòbil amb la versió d'ahir
-- carregada la ignori.
drop function if exists public.admin_gimcana_queue(uuid);

create function public.admin_gimcana_queue(p_event_id uuid)
returns table (
  id uuid,
  path text,
  prova text,
  punts integer,
  qui text,
  equip text,
  equip_ordre integer,
  escola text,
  quan timestamptz,
  a_la_cua integer,
  foto_esborrada_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.path,
    p.titol,
    p.punts,
    pr.nombre,
    e.nom,
    e.ordre,
    e.escola,
    s.created_at,
    count(*) over ()::int,
    -- Des de quan la foto ja no compta: la mateixa regla que la fa sobrar a
    -- `storage_garbage`, o sigui que la pantalla i l'escombrada no poden dir
    -- coses diferents.
    case
      when private.gimcana_tancada_a(g.event_id) < now() - interval '30 days'
      then private.gimcana_tancada_a(g.event_id) + interval '30 days'
    end
  from public.gimcana_enviaments s
  join public.gimcana_proves p on p.id = s.prova_id
  join public.gimcanes g on g.id = p.gimcana_id
  join public.profiles pr on pr.id = s.user_id
  join public.gimcana_equips e on e.id = s.equip_id
  where g.event_id = p_event_id
    and s.estat = 'pendent'
    and (select private.is_admin())
  order by s.created_at
$$;

revoke all on function public.admin_gimcana_queue(uuid) from public, anon;
grant execute on function public.admin_gimcana_queue(uuid) to authenticated;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/91_l_storage_es_buida_sol.sql. Desfer-ho torna la cua
-- sense la columna; el client la llegeix amb `?? null` i, sense
-- `my_storage_garbage`, l'escombrada en segon pla falla sense dir res, o sigui
-- que no cal desfer-lo alhora. Els objectes que ja s'hagin esborrat no tornen.

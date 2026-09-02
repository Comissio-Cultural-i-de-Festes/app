-- L'avís del mòbil el dia de la revelació.
--
-- DEPARTURE FROM THE SPEC. La secció 13 diu «Sin push en v1. El canal es
-- WhatsApp», i el motiu que hi dóna segueix sent cert: a iOS una PWA només rep
-- push si l'usuari l'ha afegida a la pantalla d'inici. Es fa igualment, i amb
-- els ulls oberts: l'avís és un *extra* i no el camí. Qui no el rebi —permís
-- denegat, telèfon en silenci, subscripció caducada, Safari sense instal·lar—
-- es troba la targeta «Ja es pot dir» a dalt de l'Inici el primer cop que obre
-- l'app (migració 46). Aquesta migració no és la promesa; és la millora.
--
-- LA BASE DE DADES ÉS L'AUTORITAT I LA FUNCIÓ NOMÉS XIFRA I ENVIA.
-- Web Push demana signar un JWT VAPID amb ECDSA P-256 i xifrar el cos amb
-- AES128GCM sobre ECDH+HKDF. Postgres no ho pot fer, i per tant hi ha d'haver
-- una Edge Function. El que NO ha de tenir aquella funció és accés a la base:
-- la capçalera de `check-in/index.ts` explica per què —una credencial sense
-- límits guardada darrere d'un parser de TypeScript converteix un error de
-- parsing en compromís total.
--
-- Així que el `cron` munta el missatge sencer *i la llista de subscripcions* i
-- els hi passa al cos de la petició. La funció rep un paquet ja decidit, el
-- xifra i el posta. No sap qui és ningú, no pot preguntar-ho, i no té cap clau
-- de base de dades. Si algú l'aconseguís cridar, el màxim que pot fer és
-- enviar el que porti a la petició.
--
-- AL MÉS UNA VEGADA, I A POSTA. `avisat_at` es marca a la mateixa transacció
-- que encua la petició, i `pg_net` és asíncron: si l'enviament falla no es
-- reintenta. L'alternativa —marcar-ho quan la resposta arribi— vol una taula
-- d'estat, un reintent i una finestra en què dues execucions del cron envien
-- el mateix avís dues vegades. Un avís perdut el cobreix la targeta de
-- l'Inici; un avís duplicat a les vuit del matí no el cobreix res.
--
-- EL SECRET NO ÉS AL REPOSITORI. La migració referencia
-- `vault.decrypted_secrets` pel nom; el valor el posa el mantenidor, i el
-- mateix valor va a la funció com a variable d'entorn. Si el secret no hi és,
-- el `cron` no envia res i ho diu al registre en comptes de petar.

-- `pg_net` per sortir de la base, i s'aixeca amb instruccions si no hi és, com
-- fa la migració 10 amb `pg_cron`: una extensió que falta en silenci vol dir
-- una funció que sembla programada i no s'executa mai.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      -- Sense `with schema`: pg_net crea el seu propi esquema `net` i les
      -- funcions hi van sempre, digui el que digui la clàusula.
      create extension pg_net;
    exception when others then
      raise exception
        'Cal l''extensio pg_net per enviar els avisos de revelacio. '
        'Activa-la al tauler de Supabase (Database > Extensions > pg_net) i '
        'torna a aplicar aquesta migracio.'
        using errcode = '0A000';
    end;
  end if;
end $$;

-- ── on viu una subscripció ──────────────────────────────────────────────────
-- Una fila per navegador i no per persona: el mateix compte al mòbil i al
-- portàtil són dos endpoints, i els dos han de rebre l'avís. `endpoint` és la
-- clau perquè és el que el servei de push considera únic; si algú reinstal·la
-- l'app en surt un de nou i el vell deixa de valer.
create table public.push_subscription (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscription_user_idx on public.push_subscription (user_id);

comment on table public.push_subscription is
  'Una subscripció de Web Push per navegador. Cap SELECT per a authenticated: '
  'les claus d''una subscripció permeten enviar-li avisos, i qui les té pot '
  'escriure al mòbil d''algú altre. Només el cron les llegeix, i el fa una '
  'funció definer.';

alter table public.push_subscription enable row level security;

-- Cadascú la seva, i escriure-la és tot el que el client necessita fer.
create policy push_insert_self on public.push_subscription
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member()));

create policy push_delete_self on public.push_subscription
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Reinscriure el mateix endpoint ha de poder actualitzar les claus: el
-- navegador les rota sol de tant en tant i el client fa un upsert.
create policy push_update_self on public.push_subscription
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy push_select_self on public.push_subscription
  for select to authenticated
  using (user_id = (select auth.uid()));

-- I aquí està la barrera de debò: cap `select` per a `authenticated`. La
-- política de dalt hi és per a l'`on conflict` de l'upsert i perquè
-- `010_structure` demana com a mínim una política; el que impedeix llegir les
-- claus dels altres és el privilegi que no s'ha donat.
revoke all on public.push_subscription from anon, authenticated;
grant insert, update, delete on public.push_subscription to authenticated;
grant select, insert, update, delete on public.push_subscription to service_role;

-- ── quan ja s'ha avisat ─────────────────────────────────────────────────────
alter table public.events add column avisat_at timestamptz;

comment on column public.events.avisat_at is
  'Quan es va encuar l''avís de la revelació. Una fila per esdeveniment i no '
  'per persona: és el que fa el cron idempotent sense una taula d''estat.';

-- ── el paquet que la funció rebrà ───────────────────────────────────────────
-- Tot decidit aquí: el títol el llegeix la base —que sí que el pot llegir— i
-- les subscripcions també. La funció rep una cosa tancada.
create or replace function private.reveal_push_payload(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'titol', t.titulo,
    'quan', e.starts_at,
    'url', '/esdeveniment/' || e.id::text,
    'subscripcions', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'endpoint', s.endpoint,
          'p256dh', s.p256dh,
          'auth', s.auth
        ))
        from public.push_subscription s
        -- Només qui ho ha demanat. «Avisa'm» és una acció explícita i això és
        -- l'única cosa que la fa servir: ningú no rep un avís per ser soci.
        where s.user_id in (
          select i.user_id from public.event_interest i where i.event_id = e.id
        )
      ),
      '[]'::jsonb
    )
  )
  from public.events e
  join public.event_title t on t.event_id = e.id
  where e.id = p_event_id
$$;

comment on function private.reveal_push_payload(uuid) is
  'El missatge sencer i la llista de subscripcions a qui va. Es munta aquí '
  'perquè l''Edge Function no ha de poder preguntar res a la base: rep un '
  'paquet tancat, el xifra i el posta.';

alter function private.reveal_push_payload(uuid) owner to postgres;
revoke all on function private.reveal_push_payload(uuid) from public, anon, authenticated;

-- ── el cron ─────────────────────────────────────────────────────────────────
create or replace function private.send_reveal_pushes()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_token  text;
  v_event  record;
  v_body   jsonb;
  v_sent   int := 0;
begin
  -- Els dos secrets. Si no hi són, no s'envia res i es diu: una funció
  -- programada que falla en silenci cada minut és pitjor que una que no hi és.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'reveal_push_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'reveal_push_token';

  if v_url is null or v_token is null then
    raise warning
      'reveal_push_url o reveal_push_token no son al vault: no s''envia cap avis';
    return 0;
  end if;

  -- Els que s'acaben de revelar i encara no s'han avisat. Amb una finestra:
  -- un esdeveniment revelat fa tres mesos que ningú no havia avisat no ha de
  -- disparar un avís el dia que això s'apliqui.
  for v_event in
    select e.id
      from public.events e
     where e.published
       and e.avisat_at is null
       and e.reveal_at is not null
       and e.reveal_at <= now()
       and e.reveal_at > now() - interval '2 days'
       and e.starts_at > now()
     order by e.reveal_at
     limit 20
     for update of e skip locked
  loop
    v_body := private.reveal_push_payload(v_event.id);

    -- Sense ningú a qui avisar no s'encua res, però es marca igualment: si no,
    -- el cron el tornaria a mirar cada minut per sempre.
    if jsonb_array_length(v_body -> 'subscripcions') > 0 then
      -- `net.http_post` i no `extensions.http_post`: pg_net posa les seves
      -- funcions a l'esquema `net` encara que l'extensió es creï en un altre,
      -- i amb `search_path = ''` cal qualificar-ho sencer.
      perform net.http_post(
        url := v_url,
        body := v_body,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-reveal-token', v_token
        )
      );
      v_sent := v_sent + 1;
    end if;

    -- A la mateixa transacció que l'encuada, i per tant al més una vegada.
    -- Vegeu la nota de dalt: un avís duplicat no el cobreix res.
    update public.events set avisat_at = now() where id = v_event.id;
  end loop;

  insert into public.audit_log (actor_id, accio, detall)
  values (null, 'reveal_push', jsonb_build_object('enviats', v_sent));

  return v_sent;
end $$;

comment on function private.send_reveal_pushes() is
  'Mira quins esdeveniments s''acaben de revelar i encua l''avís. Al més una '
  'vegada: marca avisat_at a la mateixa transacció que l''encuada, perquè un '
  'avís perdut el cobreix la targeta de l''Inici i un de duplicat no el '
  'cobreix res.';

alter function private.send_reveal_pushes() owner to postgres;
revoke all on function private.send_reveal_pushes() from public, anon, authenticated;

-- Cada minut. La revelació té una hora exacta i la gent hi està esperant: un
-- quart d'hora de retard converteix «seràs dels primers a saber-ho» en una
-- cosa que ja s'ha explicat pel grup de WhatsApp.
select cron.schedule(
  'send-reveal-pushes',
  '* * * * *',
  $$ select private.send_reveal_pushes() $$
);

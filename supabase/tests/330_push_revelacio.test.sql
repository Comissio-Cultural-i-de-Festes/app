-- L'avís de la revelació, i el que no es pot llegir.
--
-- LES CLAUS D'UNA SUBSCRIPCIÓ SÓN LA CAPACITAT D'ESCRIURE AL MÒBIL D'ALGÚ.
-- `p256dh` i `auth` són exactament el que fa falta per xifrar-li una
-- notificació; qui les tingui pot fer sonar el telèfon d'un altre soci. Per
-- això `authenticated` no té SELECT sobre la taula, i per això això s'asserta:
-- hi ha una política de SELECT per la pròpia fila —que l'`on conflict` de
-- l'upsert necessita, i que `010_structure` demana— i és fàcil mirar-la i
-- concloure que la lectura està resolta.
--
-- I EL CRON HA DE SER IDEMPOTENT. `avisat_at` es marca a la mateixa
-- transacció que l'encuada; si això es trencés, el cron enviaria el mateix
-- avís cada minut. Un avís perdut el cobreix la targeta de l'Inici; seixanta
-- avisos iguals no els cobreix res.

begin;
select plan(9);

reset role;

-- ── el grant, que és la barrera ─────────────────────────────────────────────
select is(
  (select count(*)::int
     from information_schema.column_privileges
    where grantee = 'authenticated'
      and table_schema = 'public'
      and table_name = 'push_subscription'
      and privilege_type = 'SELECT'),
  0,
  'authenticated no té SELECT sobre push_subscription: les claus són la capacitat d''enviar'
);

select ok(
  has_table_privilege('authenticated', 'public.push_subscription', 'INSERT')
    and has_table_privilege('authenticated', 'public.push_subscription', 'UPDATE'),
  'però sí INSERT i UPDATE, que és l''upsert que fa el navegador'
);

-- ── el paquet que la funció rebrà ───────────────────────────────────────────
insert into public.push_subscription (endpoint, user_id, p256dh, auth)
values
  ('https://push.example.invalid/un', '00000000-0000-4000-8000-000000000001', 'p-un', 'a-un'),
  ('https://push.example.invalid/dos', '00000000-0000-4000-8000-000000000002', 'p-dos', 'a-dos');

-- Només l'Alfa ho ha demanat.
insert into public.event_interest (event_id, user_id)
values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001');

select is(
  jsonb_array_length(
    private.reveal_push_payload('00000000-0000-4000-8000-0000000000e2') -> 'subscripcions'
  ),
  1,
  'el paquet només porta les subscripcions de qui ha premut «Avisa''m»'
);

select is(
  private.reveal_push_payload('00000000-0000-4000-8000-0000000000e2')
    -> 'subscripcions' -> 0 ->> 'endpoint',
  'https://push.example.invalid/un',
  'i és la de la persona que ho va demanar, no la de l''altre soci'
);

-- El títol, que és tot el sentit de l'avís, i que la funció definer sí que pot
-- llegir encara que el soci no.
select is(
  private.reveal_push_payload('00000000-0000-4000-8000-0000000000e2') ->> 'titol',
  (select titulo from public.event_title
    where event_id = '00000000-0000-4000-8000-0000000000e2'),
  'i el títol, que la funció pot llegir perquè és definer'
);

-- ── el cron, sense secrets ──────────────────────────────────────────────────
-- Sense res al vault no s'envia i es marca res: una funció programada que
-- falla en silenci cada minut és pitjor que una que no hi és.
select is(
  private.send_reveal_pushes(),
  0,
  'sense secrets al vault no s''envia cap avís'
);

select is(
  (select avisat_at from public.events where id = '00000000-0000-4000-8000-0000000000e2'),
  null,
  'i tampoc no es marca com a avisat, o l''avís es perdria per sempre'
);

-- ── i és idempotent ─────────────────────────────────────────────────────────
-- Simulat marcant-lo a mà, que és el que la funció fa en encuar: el que
-- s'asserta és que un esdeveniment ja marcat no el torna a mirar.
update public.events set reveal_at = now() - interval '1 minute', avisat_at = now()
 where id = '00000000-0000-4000-8000-0000000000e2';

-- Escopat a l'esdeveniment de la prova: el seed en porta d'altres que sí que
-- entren a la selecció, i comptar-los tots faria que això mesurés el seed.
select is(
  (select count(*)::int from public.events
    where id = '00000000-0000-4000-8000-0000000000e2'
      and published and avisat_at is null and reveal_at is not null
      and reveal_at <= now() and reveal_at > now() - interval '2 days'
      and starts_at > now()),
  0,
  'un esdeveniment ja avisat no torna a entrar a la selecció del cron'
);

-- ── i el treball està programat ─────────────────────────────────────────────
select is(
  (select schedule from cron.job where jobname = 'send-reveal-pushes'),
  '* * * * *',
  'cada minut: la revelació té una hora exacta i la gent hi està esperant'
);

reset role;
select * from finish();
rollback;

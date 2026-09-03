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
select plan(20);

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

-- I CAP ALTRE TAMPOC. Aquesta asserció deia el contrari: comprovava que hi
-- hagués INSERT i UPDATE «que és l'upsert que fa el navegador», tres línies
-- sota d'assertar que no hi ha SELECT. Les dues passaven i juntes eren
-- impossibles: un `on conflict do update` exigeix el SELECT que la de dalt
-- nega. El test mirava la forma dels permisos i mai el comportament, i per
-- això va deixar passar un push que a producció no va desar res mai.
select ok(
  not has_table_privilege('authenticated', 'public.push_subscription', 'INSERT')
    and not has_table_privilege('authenticated', 'public.push_subscription', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.push_subscription', 'DELETE')
    and not has_table_privilege('authenticated', 'public.push_subscription', 'SELECT'),
  'cap grant de cap mena: l''unica entrada es save_push_subscription()'
);

-- ── i ara el comportament, que és el que faltava ────────────────────────────
select tests.authenticate_as('alfa');

select lives_ok(
  $$select public.save_push_subscription(
      'https://push.example.invalid/nou', 'p-nou', 'a-nou')$$,
  'un soci pot desar la seva subscripcio per la RPC'
);

-- Dues vegades el mateix endpoint: s'actualitza, no es duplica. És el cas de
-- debò —el navegador rota les claus— i el que l'upsert havia d'atendre.
select lives_ok(
  $$select public.save_push_subscription(
      'https://push.example.invalid/nou', 'p-rotada', 'a-rotada')$$,
  'i tornar-hi amb claus noves no peta'
);

reset role;

select is(
  (select count(*)::int from public.push_subscription
    where endpoint = 'https://push.example.invalid/nou'),
  1,
  'queda una sola fila per endpoint, amb les claus noves'
);

select is(
  (select p256dh from public.push_subscription
    where endpoint = 'https://push.example.invalid/nou'),
  'p-rotada',
  'i son les ultimes que el navegador va donar'
);

select is(
  (select user_id from public.push_subscription
    where endpoint = 'https://push.example.invalid/nou'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'atribuida a auth.uid() i no a cap parametre'
);

-- Un endpoint pot canviar de mà: mateix navegador, una altra persona hi entra.
select tests.authenticate_as('bravo');

select lives_ok(
  $$select public.save_push_subscription(
      'https://push.example.invalid/nou', 'p-bravo', 'a-bravo')$$,
  'i si al mateix navegador hi entra algu altre, la fila passa a ser seva'
);

reset role;

select is(
  (select user_id from public.push_subscription
    where endpoint = 'https://push.example.invalid/nou'),
  '00000000-0000-4000-8000-000000000002'::uuid,
  'perque si no els avisos anirien a qui ja no hi es'
);

-- Un soci no pot llegir la taula ni sabent que hi és: el que el 42501 protegeix
-- son les claus dels altres.
select tests.authenticate_as('alfa');

select throws_ok(
  'select count(*) from public.push_subscription',
  '42501',
  null,
  'i seguir sense poder llegir-la, que es el que protegeix les claus dels altres'
);

select throws_ok(
  $$select public.save_push_subscription('no-es-una-adreca', 'p', 'a')$$,
  '22023',
  null,
  'un endpoint que no es una adreca https es refusa'
);

reset role;
select tests.authenticate_as('pendent_alfa');

select throws_ok(
  $$select public.save_push_subscription(
      'https://push.example.invalid/pendent', 'p', 'a')$$,
  '42501',
  null,
  'i qui encara no es soci no en pot desar cap'
);

reset role;

select ok(
  not has_function_privilege('anon',
    'public.save_push_subscription(text, text, text)', 'EXECUTE'),
  'anon no la pot executar: invite_preview segueix sent l''unica que pot'
);

reset role;

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

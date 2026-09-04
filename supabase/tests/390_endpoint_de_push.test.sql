-- L'endpoint d'una subscripció de push, i d'on pot ser.
--
-- LA MIGRACIÓ 60 posa el CHECK. La meitat positiva és la que importa més:
-- aquesta columna és per on entra la subscripció de cada telèfon, i una tanca
-- massa estreta deixaria mig navegador sense avisos sense que res ho digués
-- —el símptoma seria «a mi no m'arriben», que no es depura.
--
-- Es prova per la RPC i no escrivint la taula a mà, perquè `authenticated` no
-- té cap grant de DML aquí: `save_push_subscription` és l'única entrada, i és
-- el camí que fa servir el client de debò.
--
-- Persones i endpoints inventats, com a tot el repo.

begin;
select plan(10);

reset role;
select tests.authenticate_as('alfa');

-- ── Els cinc serveis que existeixen ─────────────────────────────────────────

select lives_ok(
  $$ select public.save_push_subscription(
       'https://fcm.googleapis.com/fcm/send/AUDIT-chrome', 'p256dh-audit', 'auth-audit') $$,
  'Chrome i Android, per fcm.googleapis.com: val'
);

select lives_ok(
  $$ select public.save_push_subscription(
       'https://android.googleapis.com/gcm/send/AUDIT-antic', 'p256dh-audit', 'auth-audit') $$,
  'els endpoints antics de Chrome: valen'
);

select lives_ok(
  $$ select public.save_push_subscription(
       'https://updates.push.services.mozilla.com/wpush/v2/AUDIT-ff', 'p256dh-audit', 'auth-audit') $$,
  'Firefox: val'
);

select lives_ok(
  $$ select public.save_push_subscription(
       'https://web.push.apple.com/AUDIT-safari', 'p256dh-audit', 'auth-audit') $$,
  'Safari i iOS: val'
);

select lives_ok(
  $$ select public.save_push_subscription(
       'https://sfo.notify.windows.com/w/?token=AUDIT-edge', 'p256dh-audit', 'auth-audit') $$,
  'Edge, amb el seu subdomini: val'
);

-- ── I la SSRF, que és el motiu del fitxer ───────────────────────────────────

select throws_ok(
  $$ select public.save_push_subscription(
       'https://el-servidor-del-soci.example/rep', 'p256dh-audit', 'auth-audit') $$,
  '23514', null,
  'un amfitrio qualsevol: refusat'
);

-- El truc de posar el nom del servei on no toca.
select throws_ok(
  $$ select public.save_push_subscription(
       'https://atacant.example/fcm.googleapis.com/send', 'p256dh-audit', 'auth-audit') $$,
  '23514', null,
  'el nom del servei al cami i no a l''amfitrio: refusat'
);

select throws_ok(
  $$ select public.save_push_subscription(
       'https://fcm.googleapis.com.atacant.example/send', 'p256dh-audit', 'auth-audit') $$,
  '23514', null,
  'un subdomini que acaba en un altre domini: refusat'
);

-- I el subdomini de Windows no val per a qualsevol cosa que hi acabi.
select throws_ok(
  $$ select public.save_push_subscription(
       'https://atacant.example/x.notify.windows.com/w', 'p256dh-audit', 'auth-audit') $$,
  '23514', null,
  'ni el de Windows fora del seu lloc: refusat'
);

-- La validació de forma de la migració 51 segueix sent la primera porta, i el
-- seu codi és un altre: aixi es veu quina de les dues ha parlat.
select throws_ok(
  $$ select public.save_push_subscription(
       'http://fcm.googleapis.com/fcm/send/AUDIT', 'p256dh-audit', 'auth-audit') $$,
  '22023', null,
  'sense https, la parla la validacio de forma i no el CHECK'
);

select * from finish();
rollback;

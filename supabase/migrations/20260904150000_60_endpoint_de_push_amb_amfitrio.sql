-- L'endpoint d'una subscripció de push ha de ser d'un servei de push.
--
-- QUÈ HI HAVIA. `save_push_subscription` (migració 51) validava la FORMA de
-- l'endpoint —que comenci per `https://`, que no passi de mil caràcters, que
-- no porti espais— i no l'AMFITRIÓ. Així que un soci podia desar-hi qualsevol
-- URL https, i el dia d'una revelació `pg_cron` la passa a l'Edge Function
-- `reveal-push`, que hi fa un POST.
--
-- O sigui: una petició sortint des de la infraestructura cap a on digui un
-- soci. És una SSRF cega, i cega de debò: el cos va xifrat amb les claus que
-- ell mateix ha donat, la resposta no torna enlloc, i la funció corre al
-- sandbox de Deno de Supabase i no dins de la xarxa de la base. El valor per a
-- qui ho intenti és baix.
--
-- EL QUE NO ÉS BAIX és el que passa amb la disponibilitat, i això no ho havia
-- vist jo sinó l'auditoria de la funció: `reveal-push` no té timeout per
-- subscripció, i `Promise.allSettled` espera totes. Un endpoint que accepta la
-- connexió i no contesta mai fa que l'avís de la revelació no arribi a NINGÚ.
-- Amb una fila. Aquesta tanca és, sobretot, per això.
--
-- LA LLISTA. Els amfitrions dels serveis de push que existeixen:
--
--   fcm.googleapis.com              Chrome i Android
--   android.googleapis.com          Chrome, endpoints antics
--   updates.push.services.mozilla.com   Firefox
--   web.push.apple.com              Safari i iOS
--   *.notify.windows.com            Edge
--
-- Va com a CHECK de la columna i no dins de la RPC a posta: la columna no té
-- cap grant de DML per a `authenticated` —la migració 51 ho explica— però una
-- restricció a la taula val per a qualsevol camí, també per al dia que algú
-- torni a donar un grant sense pensar-hi. Mateix raonament que la 51 fa per a
-- les polítiques.
--
-- COMPROVAT ABANS D'APLICAR-HO: l'única subscripció de producció és a
-- `fcm.googleapis.com`. Zero files rebutjades.
--
-- EL QUE AIXÒ NO ARREGLA: el timeout de `reveal-push`, que és la meitat de
-- codi de la funció i va al backlog. Aquesta tanca fa que la llista d'on
-- s'envia sigui de confiança; no fa que enviar-hi sigui ràpid.

alter table public.push_subscription
  add constraint push_subscription_endpoint_host_check check (
    endpoint ~ '^https://fcm\.googleapis\.com/'
    or endpoint ~ '^https://android\.googleapis\.com/'
    or endpoint ~ '^https://updates\.push\.services\.mozilla\.com/'
    or endpoint ~ '^https://web\.push\.apple\.com/'
    or endpoint ~ '^https://[a-z0-9-]+\.notify\.windows\.com/'
  );

comment on column public.push_subscription.endpoint is
  'On enviar l''avis. El CHECK d''aquesta columna exigeix que sigui un amfitrio '
  'd''un servei de push de debo: sense ell, un soci hi podia posar el seu '
  'servidor i `reveal-push` hi feia un POST, i un endpoint que no contesta mai '
  'deixa tota l''associacio sense avis perque la funcio espera totes les '
  'subscripcions.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- alter table public.push_subscription
--   drop constraint push_subscription_endpoint_host_check;
--
-- Si algun dia surt un navegador amb un servei de push nou, el que cal és
-- AFEGIR-HI l'amfitrio, no treure la restriccio.

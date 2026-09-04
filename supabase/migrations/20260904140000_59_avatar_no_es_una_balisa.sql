-- L'avatar deixa de poder ser una balisa de seguiment.
--
-- QUÈ HI HAVIA. Tres coses que per separat estan bé i juntes obren una porta:
--
--   1. `authenticated` té grant d'UPDATE de columna sobre `profiles.avatar_url`
--      (migració 3), perquè canviar-se la foto és cosa de cadascú.
--   2. La columna no tenia cap `CHECK`, i el disparador `profiles_guard` només
--      vigila `id`, `role`, `estat` i `created_at`.
--   3. `useAvatarUrl.ts:61-76` torna qualsevol URL absoluta TAL QUAL, sense
--      signar-la, i acaba al `src` d'una `<img>` a vint-i-cinc llocs.
--
-- El pas per alt de la signatura existeix per un motiu bo i escrit: les fotos
-- de Google són URL absolutes i no es poden signar. El que no hi havia enlloc
-- és la comprovació que l'URL absoluta SIGUI de Google. L'excepció es va
-- pensar per a un amfitrió concret i es va implementar com «qualsevol cosa que
-- comenci per http».
--
-- L'ATAC, que és d'una sola petició HTTP i sense eines: un soci es posa
-- `https://el-seu-servidor/x.png` a l'avatar. A partir d'aquí, cada vegada que
-- algú obre el rànquing, la llista de qui ve a una festa o la pantalla de la
-- porta, el navegador d'aquella persona demana una imatge al servidor del
-- soci i li entrega IP, User-Agent i hora. La junta inclosa. En una associació
-- petita, això és saber qui és a la porta i a quina hora.
--
-- NO ÉS XSS, i val la pena dir-ho perquè canvia la gravetat: `isStoragePath()`
-- envia tot el que NO comença per `http://` o `https://` al camí del bucket, on
-- `createSignedUrl` falla i el component pinta el marcador. O sigui que un
-- `javascript:` o un `data:text/html` no arriben enlloc, i una `<img>` no
-- executa res. I `Avatar.tsx` posa `referrerpolicy`, així que l'atacant no rep
-- la capçalera `Referer` i no sap quina pantalla es mirava. El que queda és la
-- balisa, que ja és prou.
--
-- LA TANCA. Tres formes i cap més: cap avatar, un camí del bucket `avatars`
-- —que és el que escriu `uploadAvatar()`: `{uuid}/{millis}.jpg|webp`— o un
-- amfitrió de Google. `lh[0-9]+` i no `lh3` a seques: Google reparteix les
-- fotos entre `lh3` i `lh6` i fixar-ne un és tornar-hi d'aquí sis mesos.
--
-- COMPROVAT ABANS D'APLICAR-HO, contra les files reals de producció: de set
-- perfils, un té l'avatar buit, sis el tenen a `lh3.googleusercontent.com` i
-- cap n'usa un camí de bucket. Zero files rebutjades.
--
-- EL QUE AIXÒ NO FA, i queda al backlog: seguim servint una imatge d'un tercer,
-- o sigui que Google veu qui obre quina pantalla i quan. Tancar-ho del tot vol
-- copiar la foto al bucket en entrar i no acceptar cap URL absoluta, que és una
-- migració més un canvi al camí d'entrada més omplir les sis files que hi ha.
-- Es va descartar per ara: si es fa malament, tothom es queda sense cara.

alter table public.profiles
  add constraint profiles_avatar_url_check check (
    avatar_url is null
    or avatar_url ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]+\.(jpg|webp)$'
    or avatar_url ~ '^https://lh[0-9]+\.googleusercontent\.com/'
  );

comment on column public.profiles.avatar_url is
  'La foto, com a cami del bucket `avatars` o com a URL de Google. El CHECK '
  'd''aquesta columna es l''unica cosa que impedeix que sigui una balisa: '
  '`authenticated` te grant d''UPDATE aqui, i `useAvatarUrl` torna qualsevol '
  'URL absoluta sense signar-la fins al `src` d''una imatge.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- alter table public.profiles drop constraint profiles_avatar_url_check;
--
-- Desfer-ho torna a deixar que qualsevol soci apunti l'avatar on vulgui.

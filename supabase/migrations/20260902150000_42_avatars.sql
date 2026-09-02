-- La foto del perfil, i on viu.
--
-- CAP CANVI A `profiles`. Això és el que sorprèn de la migració: la columna
-- `avatar_url` i el nom ja es podien escriure des del primer dia. La migració
-- 03 fa `grant update (nombre, avatar_url, escola, grau, curs,
-- hide_from_ranking)` i la 04 hi posa `profiles_update_self`; el que faltava
-- no era un permís, era una pantalla i un lloc on deixar el fitxer.
--
-- UN BUCKET PROPI I NO `door-photos`. Les dues coses són la cara d'algú, però
-- no són el mateix tipus de dada: una foto de porta és un registre d'un moment
-- que només la junta pot obrir, i un avatar és una foto que la persona tria
-- perquè tothom la vegi al rànquing i a la llista de qui va a cada festa. Fer
-- passar l'avatar per `door-photos` voldria obrir aquell bucket a tots els
-- socis, que és exactament el contrari del que diu la migració 14.
--
-- PRIVAT, COM ELS ALTRES DOS. El motiu de la migració 14 val igual aquí i
-- pesa més: un bucket «públic» de Supabase és públic a Internet, no caduca mai
-- i continua funcionant quan algú ha plegat de l'associació. Per a una portada
-- això és un espòiler; per a la cara d'un soci de vint anys és una foto seva a
-- l'Internet obert per sempre. Es llegeix amb URL signades d'una hora, com la
-- resta.
--
-- I EL CAMÍ ÉS EL PERMÍS, com a la migració 34: `{uid}/{quan}.{ext}`. Amb
-- l'identificador com a carpeta i no com a nom de fitxer, una política pot
-- decidir qui hi pot tocar sense consultar cap taula.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- 2 MB, com les fotos de porta i no com les portades: el client ja
  -- redimensiona a 1600 px i un avatar es veu a 72. Els cinc de les portades
  -- hi són perquè una portada és la imatge que fa tocar; això és una cara
  -- rodona de 72 píxels.
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ── de qui és un avatar, pel seu camí ───────────────────────────────────────
-- El mateix motiu i la mateixa forma que `private.door_photo_owner`:
-- `language sql` amb una guarda de regex i no plpgsql amb un bloc d'excepció,
-- perquè això es crida un cop per fila dins d'una política de SELECT i un
-- gestor d'excepcions costa una subtransacció cada vegada. Un `case` sense
-- `else` dóna el null que un camí mal format es mereix, i una política que rep
-- null refusa.
create or replace function private.avatar_owner(p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when array_length(storage.foldername(p_name), 1) = 1
     and (storage.foldername(p_name))[1] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
  end
$$;

comment on function private.avatar_owner(text) is
  'El soci de qui és un avatar, llegit del seu camí, o null si el camí no és '
  '{uid}/…. No aixeca mai: corre dins de polítiques d''storage, on una '
  'excepció és un 500 i no una negativa.';

alter function private.avatar_owner(text) owner to postgres;
revoke all on function private.avatar_owner(text) from public, anon;
grant execute on function private.avatar_owner(text) to authenticated;

-- ── les polítiques ──────────────────────────────────────────────────────────
-- Llegible per qui pot veure el directori de socis, que és qui ja veu el nom i
-- l'escola de tothom (`profiles_select_directory`). Amb `is_member_or_pending`
-- seria més ampli que la fila que descriu la foto, i qui encara espera l'alta
-- no ha de tenir la cara de ningú.
create policy "avatars are readable by members"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select private.is_active_member()));

-- Cadascú a la seva carpeta i enlloc més. Un soci actiu i no un pendent: qui
-- espera l'alta encara no surt a cap llista, i per tant no hi ha res que la
-- seva foto pugui il·lustrar.
create policy "avatars are written by whose face it is"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and private.avatar_owner(name) = (select auth.uid())
    and (select private.is_active_member())
  );

-- AQUÍ SÍ QUE HI HA UPDATE, i a `door-photos` no. La diferència és què és
-- cada objecte: una foto de porta és un registre d'un moment i canviar-la en
-- silenci no ho ha de poder fer ningú; un avatar és una preferència, i canviar
-- de foto és la funció. El client igualment escriu un objecte nou amb la marca
-- de temps al nom —així no ha de barallar-se amb una còpia en memòria cau de
-- l'anterior— però la política hi és perquè un `upsert` des del client no
-- fracassi amb un 42501 que ningú no sabria llegir.
create policy "avatars are replaced by whose face it is"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()))
  with check (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()));

-- I esborrar la pròpia. «Treu-la i deixa les ratlles» del full de la foto
-- posa `avatar_url` a null, i deixar l'objecte penjat al bucket voldria dir
-- que treure la foto no la treu de cap lloc. La junta no hi surt: no hi ha cap
-- pantalla que ho demani, i inventar-ne el permís abans que la pantalla és
-- l'ordre equivocat.
create policy "avatars are removed by whose face it is"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()));

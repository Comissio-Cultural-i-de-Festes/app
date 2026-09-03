-- Desar una subscripció de push, per l'única porta que la taula ha de tenir.
--
-- LA MIGRACIÓ 47 VA DEIXAR AIXÒ TRENCAT I NINGÚ NO HO VA VEURE. El client fa
-- un upsert sobre `push_subscription`, i un `insert ... on conflict do update`
-- exigeix privilegi de SELECT sobre la taula —Postgres l'ha de llegir per
-- resoldre el conflicte. A `push_subscription` el SELECT està negat a posta:
-- les claus d'una subscripció són la capacitat d'escriure al mòbil d'algú, i
-- qui les pogués llistar podria enviar avisos a tothom.
--
-- Les dues decisions són correctes per separat i incompatibles juntes. El
-- resultat a producció: cap subscripció s'ha pogut desar mai. `42501
-- permission denied for table push_subscription`, i el client el convertia en
-- un `failed` que la pantalla no arribava a ensenyar.
--
-- El comentari de la 47 ho ensenya escrit: «La política de dalt hi és per a
-- l'`on conflict` de l'upsert». Hi havia la política i no el privilegi. Una
-- política sense grant no fa res: els privilegis de columna es comproven ABANS
-- de l'RLS, i això és el primer que diu el model de seguretat d'aquest
-- repositori.
--
-- LA SORTIDA NO ÉS DONAR EL SELECT. Amb `push_select_self` una fila pròpia
-- seria l'única llegible i l'upsert funcionaria, però deixaria el privilegi
-- obert a la taula sencera amb l'RLS com a única defensa, quan la regla
-- d'aquest repositori diu el contrari: el que un soci no ha de poder fer de cap
-- manera és un grant que no s'ha donat, i l'única entrada és una funció
-- `definer`. És com hi entren `badges` i les taules de la gimcana.
--
-- Per tant: la funció escriu, i els grants de DML desapareixen. Les polítiques
-- es queden —`010_structure` demana com a mínim una per taula, i valen de
-- segona barrera el dia que algú torni a donar un grant sense pensar-hi.

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- L'actor és sempre `auth.uid()` i mai un paràmetre: si el navegador pogués
  -- dir de qui és la subscripció, podria apuntar la seva al compte d'algú
  -- altre i llegir-ne els avisos.
  if v_actor is null or not (select private.is_active_member()) then
    raise exception 'nomes socis' using errcode = '42501';
  end if;

  -- Una subscripció que no és una adreça no serveix per res i només fa créixer
  -- la taula. `https` perquè cap servei de push en fa servir cap altre.
  --
  -- Sense comptador de repeticions al patró: Postgres els limita a 255 i un
  -- `{1,1000}` aixeca `2201B invalid repetition count`. Aquí hi havia
  -- exactament aquest error i el va trobar la prova que crida la funció, no cap
  -- de les que miraven els permisos.
  if p_endpoint is null
     or p_endpoint not like 'https://_%'
     or length(p_endpoint) > 1000
     or p_endpoint ~ '[[:space:]]' then
    raise exception 'endpoint no valid' using errcode = '22023';
  end if;

  if p_p256dh is null or btrim(p_p256dh) = ''
     or p_auth is null or btrim(p_auth) = '' then
    raise exception 'calen les dues claus' using errcode = '22023';
  end if;

  -- Per `endpoint` i no per persona: el mateix compte al mòbil i al portàtil
  -- són dos navegadors i tots dos han de rebre l'avís.
  --
  -- I `on conflict` amb `user_id` a l'update a posta: un endpoint pot canviar
  -- de mà. Si algú es desconnecta i al mateix navegador hi entra una altra
  -- persona, el servei de push dóna el mateix endpoint, i la fila ha de passar
  -- a ser de qui hi és ara. Sense això, els avisos anirien a qui ja no hi és.
  insert into public.push_subscription (endpoint, user_id, p256dh, auth)
  values (p_endpoint, v_actor, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = v_actor,
        p256dh  = excluded.p256dh,
        auth    = excluded.auth;
end $$;

comment on function public.save_push_subscription(text, text, text) is
  'Desa la subscripcio de push del navegador que crida, atribuida sempre a '
  'auth.uid(). Es l''unica entrada a push_subscription: authenticated no te '
  'cap grant de DML sobre la taula, perque les claus d''una subscripcio son la '
  'capacitat d''enviar avisos al mobil de qui la va crear.';

alter function public.save_push_subscription(text, text, text) owner to postgres;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- I ara la taula queda sense cap porta directa. `delete` tampoc: res del
-- client no l'esborra —el navegador es dessubscriu ell mateix i el cron marca
-- els endpoints morts—, i un grant que ningú fa servir és superfície de més.
revoke insert, update, delete on public.push_subscription from authenticated;

comment on table public.push_subscription is
  'Una subscripcio de Web Push per navegador. Cap grant per a authenticated, '
  'de cap mena: l''unica entrada es public.save_push_subscription() i l''unica '
  'lectura la fa el cron des d''una funcio definer. Les claus d''una '
  'subscripcio permeten escriure al mobil de qui la va crear, o sigui que '
  'poder-les llistar seria poder enviar avisos en nom de la comi.';

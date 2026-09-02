-- La xarxa de seguretat: què es va revelar mentre no miraves.
--
-- QUÈ ARREGLA. «Avisa'm» promet dues coses: que t'arribarà un avís i que seràs
-- dels primers a saber-ho. La segona no depèn de cap notificació, i és la que
-- s'ha de complir sempre —el push es perd, el permís es denega, el telèfon està
-- en silenci, iOS descarta la subscripció al cap d'unes setmanes. Amb això,
-- tant si l'avís ha arribat com si no, qui va prémer el botó es troba
-- l'esdeveniment destacat a dalt de l'Inici el primer cop que obre l'app
-- després de la revelació.
--
-- CAP ESTAT NOU, i és el que fa que no es pugui desincronitzar. La targeta surt
-- quan es donen tres coses que ja es guarden: hi ha una fila teva a
-- `event_interest`, l'esdeveniment ja està revelat, i encara no has contestat.
-- Apuntar-s'hi crea la fila d'`attendances` i la targeta desapareix sola —«es
-- descarta sol quan s'hi apunta», sense cap columna de «vist» que caldria
-- escriure des del client i que quedaria mal posada el dia que la petició
-- falli.
--
-- I ÉS UNA FUNCIÓ PERQUÈ LA TAULA NO ES POT LLEGIR. `event_interest` no té
-- `grant select` per a `authenticated`, a posta (migració 45): el nombre és
-- públic i la llista no. Fins i tot per a les pròpies files, doncs, cal passar
-- per aquí.
--
-- Torna només identificadors. La targeta necessita el títol, la data i les
-- places, i tot això ja ho pot llegir a `events_public` —que per a un
-- esdeveniment revelat li dóna el títol. Repetir-ho aquí seria una segona
-- font per a les mateixes dades.

create or replace function public.my_revealed_interests()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.event_id
    from public.event_interest i
    join public.events e on e.id = i.event_id
   where i.user_id = (select auth.uid())
     and e.published
     and (e.reveal_at is null or e.reveal_at <= now())
     -- Encara per començar: un esdeveniment que ja ha passat no és cap
     -- novetat, i qui va prémer «avisa'm» i no hi va anar no ha de trobar-se
     -- la targeta d'una nit que no existeix.
     and e.starts_at > now()
     -- I no contestat. Qualsevol resposta compta, el «no» inclòs: qui ha dit
     -- que no ja ha vist de què anava.
     and not exists (
       select 1 from public.attendances a
        where a.event_id = i.event_id
          and a.user_id = i.user_id
     )
   order by e.starts_at
$$;

comment on function public.my_revealed_interests() is
  'Els esdeveniments que has demanat que t''avisin, ja revelats i encara sense '
  'resposta teva. Una funció i no una vista perquè event_interest no té '
  'SELECT per a authenticated: el nombre és públic i la llista no.';

alter function public.my_revealed_interests() owner to postgres;
revoke all on function public.my_revealed_interests() from public, anon;
grant execute on function public.my_revealed_interests() to authenticated;

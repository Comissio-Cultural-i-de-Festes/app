-- Les tanques que la migració 48 no va posar.
--
-- La 48 va afegir un tipus d'esdeveniment amb un àmbit i va anar a tapar els
-- llocs que se li van acudir. La 50 va tapar dos més que va trobar una prova
-- que demanava totes les portes de cop. Aquests tres els ha trobat una
-- auditoria de producció, i tots tres són la mateixa confusió: fins que van
-- existir les reunions, «publicat» i «revelat» volien dir «visible».
--
-- ELS COTXES. `rides_select_member` demana `event_is_revealed(event_id)`, i una
-- reunió no té `reveal_at`: està revelada des del primer moment. Amb
-- `te_cotxes` posat a una reunió de junta, qualsevol soci en llegia els cotxes
-- i qui hi puja —que és qui és de la junta i qui hi va. Avui no hi ha cap
-- reunió amb cotxes a producció, o sigui que no ha exposat res; la tanca hi va
-- perquè «avui no n'hi ha cap» no és una regla.
--
-- Els seients van per `private.ride_is_visible`, i per tant es tapen sols: una
-- sola funció i les dues polítiques de `ride_seats` l'hereten.
--
-- L'INTERÈS. `einterest_insert_self` demana `event_is_published`. Una reunió no
-- es teasereja mai —no té `reveal_at`— o sigui que ningú hi arribaria pel seu
-- camí normal, però la fila es podia escriure sabent l'identificador.
--
-- LES INSÍGNIES. `private.badge_event` numera els esdeveniments a què algú ha
-- anat per dir a quin es va guanyar cada insígnia. La 48 va posar el filtre de
-- reunions a `grant_badges` i no aquí, i per tant les dues numeraven diferent:
-- la insígnia es donava comptant sense reunions i s'atribuïa comptant amb
-- elles, o sigui a l'esdeveniment equivocat.

-- ── els cotxes ──────────────────────────────────────────────────────────────
create or replace function private.ride_is_visible(p_ride_id uuid)
returns boolean
language sql
stable
parallel safe
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and private.event_is_revealed(r.event_id)
      and not private.event_is_junta_only(r.event_id)
  )
$$;

drop policy rides_select_member on public.rides;

create policy rides_select_member on public.rides
  for select to authenticated
  using (
    (select private.is_active_member())
    and private.event_is_revealed(event_id)
    and not private.event_is_junta_only(event_id)
  );

drop policy rides_insert_driver on public.rides;

create policy rides_insert_driver on public.rides
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select private.is_active_member())
    and private.event_is_revealed(event_id)
    and not private.event_is_junta_only(event_id)
    and private.event_needs_cars(event_id)
  );

-- ── l'interès ───────────────────────────────────────────────────────────────
drop policy einterest_insert_self on public.event_interest;

create policy einterest_insert_self on public.event_interest
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and private.event_is_published(event_id)
    and not private.event_is_junta_only(event_id)
  );

-- ── les insígnies ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.badge_event(p_user uuid, p_codi text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with fets as (
    select
      a.event_id,
      e.tipo,
      e.starts_at,
      a.entry_photo_url,
      a.exit_photo_url,
      row_number() over (order by e.starts_at, e.id) as n
    from public.attendances a
    join public.events e on e.id = a.event_id
    where a.user_id = p_user and a.estado = 'asistio' and e.tipo <> 'reunio'
  )
  select case p_codi
    when 'primera'     then (select f.event_id from fets f where f.n = 1)
    when 'cinc'        then (select f.event_id from fets f where f.n = 5)
    when 'deu'         then (select f.event_id from fets f where f.n = 10)
    when 'vint_i_cinc' then (select f.event_id from fets f where f.n = 25)

    when 'cap_de_setmana' then (
      select f.event_id from fets f
       where f.tipo = 'casa_rural' order by f.starts_at, f.event_id limit 1)

    when 'entrada_i_sortida' then (
      select f.event_id from fets f
       where f.entry_photo_url is not null and f.exit_photo_url is not null
       order by f.starts_at, f.event_id limit 1)

    when 'a_muntar' then (
      select l.event_id from public.points_log l
       where l.user_id = p_user and l.motivo = 'montaje' and l.puntos > 0
       order by l.created_at, l.id limit 1)

    -- Una proposta pot no tenir encara cap activitat lligada. La targeta se'n
    -- surt igual: ensenya la descripció, com `de_tot`.
    when 'va_ser_idea_meva' then (
      select p.event_id from public.proposals p
       where p.user_id = p_user and p.estat = 'acceptada'
       order by p.created_at, p.id limit 1)

    when 'al_volant' then (
      select r.event_id from public.rides r
        join public.ride_seats s on s.ride_id = r.id
       where r.driver_id = p_user and s.estat = 'a_dins' and s.user_id <> r.driver_id
       order by s.created_at, r.id limit 1)

    when 'copilot' then (
      select r.event_id from public.ride_seats s
        join public.rides r on r.id = s.ride_id
       where s.user_id = p_user and s.estat = 'a_dins' and r.driver_id <> p_user
       order by s.created_at, r.id limit 1)

    when 'de_les_primeres' then (
      select a.event_id from public.attendances a
        join public.events e on e.id = a.event_id
       where a.user_id = p_user
         and a.estado = 'asistio'
         and e.tipo <> 'reunio'
         and a.checked_in_at is not null
         and (select count(*) from public.attendances b
               where b.event_id = a.event_id and b.checked_in_at is not null) >= 10
         and (select count(*) from public.attendances b
               where b.event_id = a.event_id
                 and b.checked_in_at is not null
                 and b.checked_in_at < a.checked_in_at) < 5
       order by e.starts_at, a.event_id limit 1)

    else null
  end
$function$;

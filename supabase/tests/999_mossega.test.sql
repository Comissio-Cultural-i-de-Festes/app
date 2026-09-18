-- FITXER DE COMPROVACIÓ, NO ÉS DE LA SUITE. Serveix per respondre una sola
-- pregunta: l'asserció «a una activitat sense preu no hi ha ningú que no hagi
-- pagat» del 220, mossega? O passaria igual amb la funció d'abans de la 69?
--
-- Aquí es prova la mateixa fila amb les dues versions de `junta_home()`, una
-- darrere l'altra i dins de la mateixa transacció que acaba en `rollback`:
-- amb la 69 el número ha de ser 0, i amb el cos de la 63 ha de ser 3. Si les
-- dues donessin el mateix, l'asserció del 220 no estaria provant res.

begin;
select plan(2);

reset role;

create temporary table qui as
select
  '00000000-0000-4000-8000-0000000000b9'::uuid as festa,
  tests.uid('alfa')    as alfa,
  tests.uid('bravo')   as bravo,
  tests.uid('charlie') as charlie;
grant select on qui to authenticated;

-- Fora de la finestra tot el que hi hagi, perquè la porta sigui aquesta fila.
update public.events set starts_at = now() + interval '90 days'
 where starts_at between now() - interval '8 hours' and now() + interval '30 hours';

insert into public.events (id, tipo, starts_at, plazas, precio_cents, puntos, published)
values ((select festa from qui), 'fiesta', now() + interval '2 hours', 20, 0, 10, true);

insert into public.event_title (event_id, titulo)
values ((select festa from qui), 'Berenar inventat de comprovacio');

-- Tres que vénen i cap pagat: l'estat de sortida de tothom.
insert into public.attendances (user_id, event_id, estado, pagado) values
  ((select alfa from qui),    (select festa from qui), 'si', false),
  ((select bravo from qui),   (select festa from qui), 'si', false),
  ((select charlie from qui), (select festa from qui), 'si', false);

select tests.authenticate_as('junta_alfa');

select is(
  (public.junta_home()->'porta'->>'no_pagats')::int,
  0,
  'amb la 69 aplicada, una activitat de franc no deu res a ningu'
);

-- ── i ara la funcio d'abans, sobre les mateixes files ───────────────────────
-- És el cos de supabase/rollbacks/69_…sql, que és el de la 63: el mateix
-- `filter` sense la condició del preu. Es queda dins de la transacció.
reset role;

create or replace function public.junta_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event   public.events%rowtype;
  v_porta   jsonb := null;
  v_pendents int;
  v_esborranys int;
  v_propers int;
  v_socis int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select * into v_event
  from public.events
  where published
    and tipo <> 'reunio'
    and starts_at between now() - interval '8 hours' and now() + interval '30 hours'
  order by starts_at
  limit 1;

  if found then
    select jsonb_build_object(
      'id', v_event.id,
      'titulo', t.titulo,
      'starts_at', v_event.starts_at,
      'ubicacion', d.ubicacion,
      'plazas', v_event.plazas,
      'de_pagament', v_event.precio_cents > 0,
      'diuen_si', count(*) filter (where a.estado in ('si', 'asistio')),
      'fitxats', count(*) filter (where a.checked_in_at is not null),
      'esperen', count(*) filter (where a.estado in ('espera', 'sollicitat')),
      'no_pagats', count(*) filter (where a.estado in ('si', 'asistio') and not a.pagado),
      'gimcana_cua', (
        select (select count(*)
                  from public.gimcana_enviaments s
                  join public.gimcana_proves pr on pr.id = s.prova_id
                 where pr.gimcana_id = g.id
                   and s.estat = 'pendent')
          from public.gimcanes g
         where g.event_id = e.id
      )
    )
    into v_porta
    from public.events e
    left join public.event_title t on t.event_id = e.id
    left join public.event_details d on d.event_id = e.id
    left join public.attendances a on a.event_id = e.id
    where e.id = v_event.id
    group by e.id, t.titulo, d.ubicacion;
  end if;

  select count(*) into v_pendents from public.profiles where estat = 'pendent';
  select count(*) into v_esborranys from public.events where not published;
  select count(*) into v_propers
    from public.events
    where tipo <> 'reunio' and starts_at >= now() - interval '8 hours';
  select count(*) into v_socis from public.profiles where estat = 'actiu';

  return jsonb_build_object(
    'porta', v_porta,
    'pendents', v_pendents,
    'esborranys', v_esborranys,
    'propers', v_propers,
    'socis', v_socis
  );
end $$;

revoke all on function public.junta_home() from public, anon;
grant execute on function public.junta_home() to authenticated;

select tests.authenticate_as('junta_alfa');

select is(
  (public.junta_home()->'porta'->>'no_pagats')::int,
  3,
  'i sense la condicio del preu el numero torna a ser tothom qui ha dit que si'
);

select * from finish();
rollback;

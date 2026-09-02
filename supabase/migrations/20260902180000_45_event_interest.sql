-- «Avisa'm»: qui està pendent d'un esdeveniment que encara no es pot dir.
--
-- NO ÉS APUNTAR-SE, i per això no és una fila d'`attendances`. Encara no se sap
-- a què t'apuntaries: no hi ha lloc, ni preu, ni títol. El que diu és «quan es
-- sàpiga, vull ser dels primers», i barrejar-ho amb un «sí» faria que la
-- pantalla de la junta comptés gent que no s'ha compromès a res i que el
-- comptador de places mentís.
--
-- EL NOMBRE ES DÓNA PER FUNCIÓ I LA TAULA NO ES POT LLEGIR. «34 hi estan
-- pendents» és una xifra pública —és el que fa que la pantalla funcioni— però
-- *qui* són no ho és. Amb un `select` sobre la taula, qualsevol soci es
-- podria descarregar la llista de qui està esperant cada festa, que és una
-- cosa que ningú no ha demanat i que la gent no espera que passi. Per tant:
-- `insert` i `delete` de la pròpia fila, i cap `select`. El comptador surt de
-- `public.event_interest_size()`, com `waitlist_size`.
--
-- I LA PRÒPIA FILA SÍ QUE ES POT SABER, perquè el botó ha de saber si ja s'ha
-- premut. Això també és una funció i no un `select`, pel mateix motiu: amb un
-- `select` filtrat per la política, «no hi ha fila» i «no la puc veure» són la
-- mateixa resposta.
--
-- SENSE `updated_at` NI ESTAT. Prémer «Avisa'm» dues vegades és la mateixa
-- intenció, i desapuntar-se és esborrar la fila. La clau primària composta ho
-- fa idempotent sense cap columna més.

create table public.event_interest (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.event_interest is
  'Qui vol que se l''avisi quan un esdeveniment es reveli. No és una '
  'assistència: encara no hi ha res a què apuntar-se. Cap grant de SELECT per '
  'a authenticated —el nombre surt d''event_interest_size() i qui són no és '
  'públic.';

-- Per al comptador, que és el que es demana a cada pintada del hero.
create index event_interest_event_idx on public.event_interest (event_id);

alter table public.event_interest enable row level security;

-- La pròpia fila i prou, i només mentre l'esdeveniment sigui visible: dir
-- «avisa'm» d'un esborrany voldria dir que existeix.
create policy einterest_insert_self on public.event_interest
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and private.event_is_published(event_id)
  );

create policy einterest_delete_self on public.event_interest
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Hi ha política de SELECT, i no és una contradicció amb el de dalt: la fila
-- pròpia és la que el botó necessita, i `010_structure` demana que tota taula
-- de `public` tingui com a mínim una política. El que impedeix llegir les
-- files dels altres no és aquesta política sinó que no hi ha `grant select`
-- per a `authenticated` —els privilegis es miren abans que l'RLS.
create policy einterest_select_self on public.event_interest
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.event_interest from anon, authenticated;
grant insert, delete on public.event_interest to authenticated;
grant select, insert, update, delete on public.event_interest to service_role;

-- ── quanta gent hi està pendent ─────────────────────────────────────────────
-- Definer, com `waitlist_size`: el nombre és públic i la llista no.
create or replace function public.event_interest_size(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.event_interest where event_id = p_event_id
$$;

comment on function public.event_interest_size(uuid) is
  'Quanta gent espera la revelació. Definer perquè la xifra és pública i la '
  'llista no: authenticated no té SELECT sobre la taula.';

alter function public.event_interest_size(uuid) owner to postgres;
revoke all on function public.event_interest_size(uuid) from public, anon;
grant execute on function public.event_interest_size(uuid) to authenticated;

-- ── i si jo ja l'he premut ──────────────────────────────────────────────────
-- També una funció. Amb un `select` filtrat per la política, «no hi ha fila» i
-- «no la puc veure» tornen el mateix, i el botó no sap quin dels dos és.
create or replace function public.my_event_interest(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_interest
     where event_id = p_event_id and user_id = (select auth.uid())
  )
$$;

alter function public.my_event_interest(uuid) owner to postgres;
revoke all on function public.my_event_interest(uuid) from public, anon;
grant execute on function public.my_event_interest(uuid) to authenticated;

-- ── prémer-lo i desprémer-lo ────────────────────────────────────────────────
-- Una RPC i no un insert directe, perquè el botó és un commutador i el client
-- no ha de saber en quin dels dos estats està per decidir quina operació fa.
-- Torna el nou estat i el nou nombre: la pantalla ensenya les dues coses i
-- demanar-les després seria una segona petició que pot arribar abans.
create or replace function public.set_event_interest(p_event_id uuid, p_vol boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'nomes socis' using errcode = '42501';
  end if;
  if not private.event_is_published(p_event_id) then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  if p_vol then
    insert into public.event_interest (event_id, user_id)
    values (p_event_id, v_me)
    on conflict (event_id, user_id) do nothing;
  else
    delete from public.event_interest
     where event_id = p_event_id and user_id = v_me;
  end if;

  return jsonb_build_object(
    'vol', p_vol,
    'quants', (select count(*)::int from public.event_interest where event_id = p_event_id)
  );
end $$;

comment on function public.set_event_interest(uuid, boolean) is
  'Prem o desprem «Avisa''m». Torna l''estat nou i el recompte nou perquè la '
  'pantalla ensenya les dues coses alhora.';

alter function public.set_event_interest(uuid, boolean) owner to postgres;
revoke all on function public.set_event_interest(uuid, boolean) from public, anon;
grant execute on function public.set_event_interest(uuid, boolean) to authenticated;

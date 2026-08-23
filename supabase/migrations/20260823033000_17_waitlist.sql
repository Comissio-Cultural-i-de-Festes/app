-- The waiting list.
--
-- The first event is thirty places and the association is a hundred people, so
-- it will fill. Without a queue the person who reads the group an hour late
-- cannot say they want to come, the junta cannot see the real demand, and a
-- place freed by a cancellation goes back to being shouted about in WhatsApp —
-- which is the thing this app exists to stop.
--
-- Deliberately small: you join the list, you see where you are on it, and the
-- junta sees the queue. Moving somebody from the list into the event is the
-- junta's decision, made by hand. No automatic promotion, because "you're in,
-- it's tonight" is a message that needs a person behind it.

-- ── is there room ───────────────────────────────────────────────────────────
-- Has to be a definer function: the rule is an aggregate over everybody's
-- rows, and a member can only read the yeses. Used inside the policies below,
-- so the answer is the same whether the write comes through set_attendance or
-- straight through PostgREST.
create or replace function private.event_has_room(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when e.plazas is null then true
    else (
      select count(*) from public.attendances a
       where a.event_id = e.id and a.estado in ('si', 'asistio')
    ) < e.plazas
  end
  from public.events e
  where e.id = p_event_id
$$;

comment on function private.event_has_room is
  'Whether an event still has a free place. An event with no cap always has '
  'room. Counts the yeses and the people already through the door, which is '
  'the same set the screens count.';

revoke all on function private.event_has_room(uuid) from public, anon;
grant execute on function private.event_has_room(uuid) to authenticated;

-- ── the policies learn about the queue ──────────────────────────────────────
-- Two new rules, and the second is the one that matters:
--
--   'si' is only allowed while there is room — otherwise anybody on the
--   waiting list could simply set themselves to yes and walk past everybody
--   who was ahead of them;
--
--   'espera' is only allowed while there is NOT room — otherwise the list
--   fills with people who could just have come, and its length stops meaning
--   anything to the junta.
--
-- The junta is unaffected: att_update_admin has neither check, so moving
-- somebody off the list and into the event is theirs to do, including past the
-- cap if they decide to.
drop policy att_insert_self on public.attendances;

create policy att_insert_self on public.attendances
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado in ('si', 'potser', 'no', 'espera')
    and private.event_is_published(event_id)
    and (estado <> 'si' or private.event_has_room(event_id))
    and (estado <> 'espera' or not private.event_has_room(event_id))
  );

drop policy att_update_self on public.attendances;

create policy att_update_self on public.attendances
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado not in ('asistio', 'cancelado')
  )
  with check (
    user_id = (select auth.uid())
    and estado in ('si', 'potser', 'no', 'espera')
    and (estado <> 'si' or private.event_has_room(event_id))
    and (estado <> 'espera' or not private.event_has_room(event_id))
  );

-- ── answering, now that yes can mean the waiting list ───────────────────────
-- Returns what actually happened rather than nothing, because "Hi vaig" can
-- now land on the list: somebody taps it on a screen drawn ten seconds ago and
-- the last place went while they were reading. Refusing that with an error
-- would be technically correct and useless. It puts them on the list and the
-- screen says so.
--
-- The advisory lock is what makes the room check mean something. Two phones
-- tapping yes at the same instant both pass a check that is not serialisable
-- on its own, and thirty-one people turn up to thirty places. The lock is per
-- event and lasts to the end of the transaction, so it costs nothing except
-- when two people answer the same event in the same millisecond.
drop function if exists public.set_attendance(uuid, text);

create or replace function public.set_attendance(p_event_id uuid, p_estado text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text := p_estado;
  v_full   boolean;
begin
  if p_estado not in ('si', 'potser', 'no') then
    raise exception 'resposta invalida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('attendance:' || p_event_id::text));

  v_full := not private.event_has_room(p_event_id);
  if p_estado = 'si' and v_full then
    v_estado := 'espera';
  end if;

  insert into public.attendances (user_id, event_id, estado)
  values ((select auth.uid()), p_event_id, v_estado)
  on conflict (user_id, event_id) do update
    set estado = excluded.estado;

  return jsonb_build_object(
    'estado', v_estado,
    'ple', v_full,
    'posicio', case when v_estado = 'espera'
                    then public.waitlist_position(p_event_id) end
  );
end $$;

comment on function public.set_attendance is
  'Sets the caller''s answer. SECURITY INVOKER: the policies on attendances do '
  'the deciding. Asking for "si" on a full event puts you on the waiting list '
  'and says so, because the alternative is an error message for something that '
  'is not a mistake. Takes a per-event advisory lock so two simultaneous yeses '
  'cannot both find the last place.';

-- ── where am I on the list ──────────────────────────────────────────────────
-- Definer, because working out that you are fourth means counting three rows
-- belonging to other people, and a member cannot read those. It returns a
-- number and nothing else: no names, no count of who is ahead by name.
create or replace function public.waitlist_position(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select posicio::int from (
    select a.user_id,
           row_number() over (order by a.created_at, a.id) as posicio
      from public.attendances a
     where a.event_id = p_event_id and a.estado = 'espera'
  ) q
  where q.user_id = (select auth.uid())
$$;

create or replace function public.waitlist_size(p_event_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.attendances
   where event_id = p_event_id and estado = 'espera'
$$;

revoke all on function public.waitlist_position(uuid) from public, anon;
revoke all on function public.waitlist_size(uuid) from public, anon;
grant execute on function public.waitlist_position(uuid) to authenticated;
grant execute on function public.waitlist_size(uuid) to authenticated;

revoke all on function public.set_attendance(uuid, text) from public, anon;
grant execute on function public.set_attendance(uuid, text) to authenticated;

-- The queue, in order, for the junta. Ordinary members are unaffected: they
-- still only see the yeses, so this index serves the admin list and the
-- position lookup above.
create index attendances_waitlist_idx
  on public.attendances (event_id, created_at)
  where estado = 'espera';

-- ── who is waiting to be approved ───────────────────────────────────────────
-- The invitations screen lists them on every visit and the table has no index
-- for it. Trivial at this size and free to add now rather than the year the
-- association is four hundred people.
create index profiles_pendent_idx
  on public.profiles (created_at)
  where estat = 'pendent';

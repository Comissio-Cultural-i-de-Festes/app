-- Answering yes, maybe or no.
--
-- WHY THIS IS NOT AN UPSERT FROM THE CLIENT, which is what it looked like it
-- should be. PostgREST turns `.upsert({ user_id, event_id, estado })` into
--
--   insert into attendances (user_id, event_id, estado) values (…)
--   on conflict (user_id, event_id)
--   do update set user_id = excluded.user_id,
--                 event_id = excluded.event_id,
--                 estado = excluded.estado
--
-- — every column in the body, not just the one that changed. And attendances
-- deliberately grants UPDATE on `estado` alone: being able to move your row
-- onto somebody else's user_id is the whole thing the column grants are there
-- to stop. So the statement is refused with 42501 before any policy runs, and
-- the member gets "permission denied" for pressing the only button on the home
-- screen.
--
-- Written out here, the ON CONFLICT branch touches `estado` and nothing else,
-- which is exactly the privilege the client has.
--
-- SECURITY INVOKER, not definer. There is no elevation to do: every rule that
-- matters — you may only write your own row, only si/potser/no, only for a
-- published event, and never once you have been checked in — is already in the
-- policies on attendances, and running as the caller is what keeps them
-- applying. A definer function here would quietly become the one path that
-- bypasses all of them.
create or replace function public.set_attendance(p_event_id uuid, p_estado text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.attendances (user_id, event_id, estado)
  values ((select auth.uid()), p_event_id, p_estado)
  on conflict (user_id, event_id) do update
    set estado = excluded.estado;
end $$;

comment on function public.set_attendance is
  'Sets the caller''s answer to an event. SECURITY INVOKER: the policies on '
  'attendances do the deciding, and this exists only because PostgREST''s '
  'upsert writes every column in the body and the client may only write '
  'estado. Rejecting a bad answer is the CHECK constraint''s job and the '
  'policy''s, not this function''s.';

revoke all on function public.set_attendance(uuid, text) from public, anon;
grant execute on function public.set_attendance(uuid, text) to authenticated;

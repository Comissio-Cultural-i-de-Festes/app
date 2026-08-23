-- Publishing and unpublishing, as an audited action of its own.
--
-- This is the most expensive mistake the junta can make in either direction:
-- an event that is live and should not be, or one that everybody is waiting
-- for and never appeared. So it gets the same treatment as the other things
-- that change what other people can see — one function, one audit row, and no
-- other way to do it.
--
-- The direct UPDATE grant on `events` goes with it. An admin could already
-- write `published` straight through PostgREST, which left no trace at all,
-- and the two functions here are SECURITY DEFINER so they do not need it.
-- Same reasoning as `invites` in migration 16.

create or replace function public.admin_set_published(p_event_id uuid, p_published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was    boolean;
  v_titulo text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  -- Locked before reading, so two admins tapping the toggle at the same time
  -- cannot both record themselves as the one who changed it.
  select e.published, e.titulo into v_was, v_titulo
  from public.events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  -- No row and no audit entry when nothing changes: a double tap is not two
  -- decisions.
  if v_was is not distinct from p_published then
    return;
  end if;

  update public.events set published = p_published where id = p_event_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'set_published',
    p_event_id,
    jsonb_build_object('titulo', v_titulo, 'de', v_was, 'a', p_published)
  );
end $$;

comment on function public.admin_set_published(uuid, boolean) is
  'Puts an event on, or takes it off, every member home screen. Audited, and '
  'the only way to change events.published now that the direct UPDATE grant '
  'is gone.';

alter function public.admin_set_published(uuid, boolean) owner to postgres;
revoke all on function public.admin_set_published(uuid, boolean) from public, anon;
grant execute on function public.admin_set_published(uuid, boolean) to authenticated;

-- ── close the unaudited path ────────────────────────────────────────────────
revoke update on public.events from authenticated;

-- The policy is unreachable without the grant, and a policy that cannot fire
-- is a comment that looks like a rule. Insert and delete keep theirs.
drop policy events_update_admin on public.events;

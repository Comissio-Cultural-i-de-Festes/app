-- Deleting an event, and the one case where it is refused.
--
-- The junta needs this: an event created by mistake, a duplicate, a test from
-- the first week. Without it the only way out is the SQL editor, which is not
-- something anybody should be opening to tidy up a typo.
--
-- What it refuses is an event that has points on it. `points_log.event_id` is
-- ON DELETE SET NULL, so deleting one of those does not remove the points —
-- it strips them of the event they came from, and everybody's profile grows a
-- row of points from nowhere while the ranking totals stay put. That is not a
-- delete, it is a smear. An event that people were checked in at is history,
-- and the way to take it off the app is to unpublish it.
--
-- Everything else does go: event_details, attendances, rides and event_content
-- all cascade, which is right for something that never happened.

create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
  v_points int;
  v_signups int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  select e.titulo into v_titulo from public.events e where e.id = p_event_id for update;

  if not found then
    raise exception 'esdeveniment inexistent' using errcode = 'P0002';
  end if;

  select count(*) into v_points from public.points_log where event_id = p_event_id;

  -- Its own code, because the screen has something specific to say about it:
  -- unpublish instead.
  if v_points > 0 then
    raise exception 'esdeveniment amb punts: %', v_points using errcode = 'P0001';
  end if;

  select count(*) into v_signups from public.attendances where event_id = p_event_id;

  -- Written before the row goes, and with the counts, because after this the
  -- trail is the only place any of it still exists.
  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'delete_event',
    p_event_id,
    jsonb_build_object('titulo', v_titulo, 'apuntats', v_signups)
  );

  delete from public.events where id = p_event_id;
end $$;

comment on function public.admin_delete_event(uuid) is
  'Removes an event that never happened. Refuses one with rows in points_log, '
  'because that FK is ON DELETE SET NULL: deleting it would keep the points '
  'and lose what they were for. Unpublish those instead.';

alter function public.admin_delete_event(uuid) owner to postgres;
revoke all on function public.admin_delete_event(uuid) from public, anon;
grant execute on function public.admin_delete_event(uuid) to authenticated;

-- Same reasoning as the UPDATE grant in migration 19: the function is a
-- definer and does not need the caller to hold the privilege, and leaving it
-- granted leaves a way to delete an event with no audit row and no check on
-- the points.
revoke delete on public.events from authenticated;
drop policy events_delete_admin on public.events;

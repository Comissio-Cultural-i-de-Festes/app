-- The points scale, edited without the dashboard.
--
-- Migration 15 put the scale in rows so the junta could settle it after the
-- first month, as the specification asks. It then left the editing to the
-- Supabase table editor, which one person has an account for — so in practice
-- the scale is provisional and unchangeable at the same time.
--
-- This is the smallest of the three configuration RPCs on purpose. It can
-- change what a row is worth and where it sits in the list, and it cannot add
-- a row or take one away.

-- ── why adding a motive is not something a screen can do ────────────────────
-- A new `motiu` is a change in three places: the row here, the CHECK on
-- points_log.motivo, and the allowlist inside award_points. A new
-- `tipus_esdeveniment` is the same story with the CHECK on events.tipo. An
-- interface can only do the first, and the result is a button that exists,
-- looks right, and fails with a constraint violation at the moment somebody
-- presses it in front of a queue.
--
-- The prototype already made exactly this mistake once: it drew a "conduir"
-- button that the CHECK rejected, and migration 15 is what fixed it.
create or replace function public.admin_set_point_value(
  p_mena text,
  p_clau text,
  p_punts int,
  p_ordre int default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_abans public.point_values%rowtype;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if p_punts is null or p_punts < 0 or p_punts > 500 then
    raise exception 'els punts han d''anar de 0 a 500' using errcode = '22023';
  end if;

  select * into v_abans
  from public.point_values
  where mena = p_mena and clau = p_clau
  for update;

  -- Not "insert if missing". A clau that is not already here is a clau the
  -- rest of the schema does not know about, and inventing the row would be the
  -- half of the change an interface can do.
  if not found then
    raise exception 'aquest motiu no existeix' using errcode = 'P0002';
  end if;

  update public.point_values
     set punts = p_punts,
         ordre = coalesce(p_ordre, ordre)
   where mena = p_mena and clau = p_clau;

  insert into public.audit_log (actor_id, accio, detall)
  values (
    (select auth.uid()),
    'set_point_value',
    jsonb_build_object(
      'mena', p_mena,
      'clau', p_clau,
      'abans', v_abans.punts,
      'ara', p_punts
    )
  );
end $$;

comment on function public.admin_set_point_value(text, text, int, int) is
  'Changes what an existing row of the scale is worth, and nothing else. '
  'Cannot add a clau: that also needs a CHECK constraint and an allowlist '
  'inside award_points, and a row on its own would be a button that fails '
  'when somebody presses it. Audited.';

alter function public.admin_set_point_value(text, text, int, int) owner to postgres;
revoke all on function public.admin_set_point_value(text, text, int, int) from public, anon;
grant execute on function public.admin_set_point_value(text, text, int, int) to authenticated;

-- The function first, then the old way out. Privileges are checked before RLS,
-- so the revoke is what closes the direct path; dropping the policy alone
-- would leave the grant for somebody to write a new policy against.
drop policy if exists pvalues_write_admin on public.point_values;
revoke insert, update, delete on public.point_values from authenticated;

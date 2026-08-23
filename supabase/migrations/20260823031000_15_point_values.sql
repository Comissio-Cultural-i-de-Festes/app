-- The points, as data.
--
-- The junta has not settled the scale, and the specification says to announce
-- it as provisional for the first month. A scale that needs a developer to
-- change is a scale that will not be changed — so it lives in a table the
-- junta edits, exactly like the term boundaries in migration 11.
--
-- The seeded numbers are the ones from section 10 of the specification. Note
-- they do NOT match the buttons drawn in the prototype, which show +10 for
-- bringing someone and +15 for a proposal; the specification says 15 and 25
-- and the specification wins until the junta says otherwise. Because these are
-- rows, saying otherwise is four keystrokes rather than a release.

-- ── driving is a way to score, and it was missing ───────────────────────────
-- Section 10: "Los puntos por conducir importan más de lo que parece: son la
-- única vía de puntuar pensada para quien no bebe." The prototype draws the
-- button. The CHECK constraint did not allow the value, so pressing it would
-- have failed with a constraint violation at the door.
alter table public.points_log drop constraint points_log_motivo_check;

alter table public.points_log add constraint points_log_motivo_check
  check (motivo in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual'));

-- ── the scale ───────────────────────────────────────────────────────────────
-- Two kinds of number in one table, told apart by `mena`:
--
--   motiu              what a button in the junta's "dona punts" screen is worth
--   tipus_esdeveniment what events.puntos is pre-filled with for a new event
--
-- The second is only a default. Once an event exists, its own `puntos` column
-- is the truth — changing the scale later must not silently restate what an
-- evening in September was worth.
create table public.point_values (
  mena  text not null check (mena in ('motiu', 'tipus_esdeveniment')),
  clau  text not null check (clau ~ '^[a-z][a-z_]{0,23}$'),
  punts int  not null check (punts between 0 and 500),
  ordre int  not null default 0,
  primary key (mena, clau)
);

comment on table public.point_values is
  'The points scale, editable by the junta without a deploy. `motiu` rows are '
  'the buttons on the awarding screen; `tipus_esdeveniment` rows only pre-fill '
  'events.puntos when an event is created, and never restate an event that '
  'already exists.';

alter table public.point_values enable row level security;

create policy pvalues_select_member on public.point_values
  for select to authenticated
  using ((select private.is_active_member()));

create policy pvalues_write_admin on public.point_values
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Privileges are checked before policies, so revoking the write grants here
-- would make the admin policy above unreachable and the junta would silently
-- have no way in. Same reasoning as ranking_periods.
revoke all on public.point_values from anon, authenticated;
grant select, insert, update, delete on public.point_values to authenticated;
grant select, insert, update, delete on public.point_values to service_role;

insert into public.point_values (mena, clau, punts, ordre) values
  ('motiu', 'montaje',     20, 1),
  ('motiu', 'conduir',     25, 2),
  ('motiu', 'trajo_gente', 15, 3),
  ('motiu', 'propuso',     25, 4),
  ('tipus_esdeveniment', 'fiesta',     10, 1),
  ('tipus_esdeveniment', 'casa_rural', 30, 2),
  ('tipus_esdeveniment', 'actividad',  10, 3)
on conflict (mena, clau) do nothing;

-- ── award_points learns the new motive, and starts leaving a trail ──────────
-- The other three admin RPCs write to audit_log. This one did not, which is
-- backwards: who gave whom twenty points is the question most likely to be
-- asked in March, and the ledger only records who granted it, not that the
-- grant was made by hand rather than by the door.
create or replace function public.award_points(
  p_user_id uuid,
  p_event_id uuid,
  p_motivo text,
  p_puntos int,
  p_nota text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;
  if p_motivo not in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual') then
    raise exception 'motiu invalid' using errcode = '22023';
  end if;
  if p_puntos = 0 or abs(p_puntos) > 500 then
    raise exception 'punts fora de rang' using errcode = '22023';
  end if;
  -- Corrections are compensating rows, and taking points away is the kind of
  -- thing that starts arguments, so it needs the higher role.
  if p_puntos < 0 and not private.is_owner() then
    raise exception 'nomes owner pot restar punts' using errcode = '42501';
  end if;

  insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
  values (p_user_id, p_event_id, p_motivo, p_puntos, p_nota, (select auth.uid()))
  returning id into v_id;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'award_points',
    p_user_id,
    jsonb_build_object('motiu', p_motivo, 'punts', p_puntos, 'esdeveniment', p_event_id)
  );

  return v_id;
end $$;

revoke all on function public.award_points(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.award_points(uuid, uuid, text, int, text) to authenticated;

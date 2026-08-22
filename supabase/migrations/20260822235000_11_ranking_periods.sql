-- Ranking over a window of the course.
--
-- Both rankings so far answer one question: who is ahead since the beginning.
-- That is the wrong question in January. Somebody who joins for the second term
-- opens the app, finds a table topped by people three hundred points out of
-- reach, and closes it — which is exactly the second-term drop-off this app
-- exists to work against. A per-term view gives every term a fresh zero.
--
-- WHERE THE BOUNDARIES LIVE, and why not in the code. The academic calendar
-- moves every year and the junta rotates every year. A term boundary that needs
-- a pull request, a review and a deploy to move is a boundary that will simply
-- stay wrong for the whole of the term it is wrong in, because the person who
-- noticed is not the person who can change it. So the periods are rows. The
-- junta edits them from the table editor; the app renders whatever it finds and
-- has no opinion about how many there are.

-- ── the periods ─────────────────────────────────────────────────────────────
-- Half-open [starts_at, ends_at): the end of one term is the start of the next,
-- with no overlap and no midnight where points fall between two terms. A NULL
-- bound is open — which is how "the whole course" is expressed without anybody
-- having to edit it every September.
create table public.ranking_periods (
  codi      text primary key check (codi ~ '^[a-z][a-z0-9_]{0,23}$'),
  -- Only for periods the junta invents. The ones shipped below are translated
  -- from their codi like the rest of the interface; anything else falls back to
  -- this label, because the alternative is showing somebody the string 't4'.
  etiqueta  text check (etiqueta is null or length(btrim(etiqueta)) between 1 and 40),
  starts_at timestamptz,
  ends_at   timestamptz,
  ordre     int not null default 0,
  constraint ranking_periods_bounds check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

comment on table public.ranking_periods is
  'The chips above the ranking. Editable by the junta because the academic '
  'calendar changes every year and a deploy is not an acceptable dependency '
  'for moving a date. Half-open intervals; a NULL bound is open-ended.';

alter table public.ranking_periods enable row level security;

create policy rperiods_select_member on public.ranking_periods
  for select to authenticated
  using ((select private.is_active_member()));

create policy rperiods_write_admin on public.ranking_periods
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Members need the write privileges for the admin policy to be reachable at
-- all: privileges are checked before RLS, so a revoke here would make the
-- policy above unreachable and the junta would silently have no way in.
revoke all on public.ranking_periods from anon, authenticated;
grant select, insert, update, delete on public.ranking_periods to authenticated;
grant select, insert, update, delete on public.ranking_periods to service_role;

-- Starting values, and nothing more than that. ON CONFLICT DO NOTHING means
-- re-running migrations never overwrites a date the junta has moved.
--
-- Derived from the day this runs rather than written out, because a migration
-- with 2026-09-01 in it is wrong for everyone who pushes it in 2028 — and
-- wrong in the quietest possible way, since a course window in the past makes
-- every score zero and the leaderboard simply looks new. September is the
-- start of the academic year; before September the course that is running is
-- last year's. The full-course row has an open end so it does not expire on a
-- date nobody will be watching.
with curs as (
  select (
    case
      when extract(month from now()) >= 9
        then make_date(extract(year from now())::int, 9, 1)
      else make_date(extract(year from now())::int - 1, 9, 1)
    end
  )::timestamptz as inici
)
insert into public.ranking_periods (codi, starts_at, ends_at, ordre)
select 'curs', inici, null, 0 from curs
union all
select 't1', inici, inici + interval '4 months', 1 from curs
union all
select 't2', inici + interval '4 months', inici + interval '7 months', 2 from curs
union all
select 't3', inici + interval '7 months', inici + interval '11 months', 3 from curs
on conflict (codi) do nothing;

-- ── the rankings ────────────────────────────────────────────────────────────
-- These take over the bodies of public.ranking and public.ranking_escoles,
-- which become thin wrappers below. One implementation, so the windowed
-- ranking and the all-time one cannot drift apart about who is hidden or how
-- ties are ranked.
--
-- WHICH DATE PUTS A POINT IN A TERM. The date of the event, not the date the
-- row was written. The junta enters montaje points on the Monday after, and
-- sometimes a fortnight after; created_at would file those under whichever term
-- the paperwork happened in. Manual points with no event fall back to when they
-- were awarded, because there is nothing else to go on.
create or replace function public.ranking_period(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  user_id    uuid,
  nombre     text,
  avatar_url text,
  escola     text,
  punts      int,
  posicio    int
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with scored as (
    select pl.user_id, pl.puntos, coalesce(e.starts_at, pl.created_at) as moment
      from public.points_log pl
      left join public.events e on e.id = pl.event_id
  )
  select
    p.id,
    p.nombre,
    p.avatar_url,
    p.escola,
    coalesce(sum(s.puntos), 0)::int,
    rank() over (order by coalesce(sum(s.puntos), 0) desc)::int
  from public.profiles p
  -- The window goes in the JOIN, never the WHERE. In the WHERE it would drop
  -- everyone who scored nothing this term out of the table altogether, so the
  -- newcomer this whole feature exists for would not appear in it.
  left join scored s
    on s.user_id = p.id
   and (p_from is null or s.moment >= p_from)
   and (p_to   is null or s.moment <  p_to)
  where p.estat = 'actiu'
    and p.hide_from_ranking = false
    and (select private.is_active_member())
  group by p.id, p.nombre, p.avatar_url, p.escola
$fn$;

comment on function public.ranking_period is
  'DEFINER BY DESIGN. Publishes per-member totals over points_log, which no '
  'client may read row by row. Three things make hide_from_ranking '
  'unbypassable and all three are needed: the predicate is in this function''s '
  'own WHERE, so no client filter can opt out of it; the column is not in the '
  'output, so there is nothing to filter on and no way to tell hidden from '
  'absent; and the WHERE runs before the window function, so the positions '
  'close up instead of leaving a numbered hole where somebody is standing.';

create or replace function public.ranking_escoles_period(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  escola           text,
  membres          int,
  esdeveniments    int,
  punts_totals     int,
  punts_per_membre numeric,
  posicio          int
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with scored as (
    select
      pl.user_id,
      pl.event_id,
      pl.puntos,
      coalesce(e.starts_at, pl.created_at) as moment
    from public.points_log pl
    left join public.events e on e.id = pl.event_id
  ),
  per_escola as (
    select
      p.escola,
      count(*)::int as membres,
      coalesce(sum(t.punts), 0)::int as punts_totals
    from public.profiles p
    left join lateral (
      select sum(s.puntos)::int as punts
        from scored s
       where s.user_id = p.id
         and (p_from is null or s.moment >= p_from)
         and (p_to   is null or s.moment <  p_to)
    ) t on true
    where p.estat = 'actiu' and p.escola is not null
    group by p.escola
  ),
  -- How many different events a school actually turned up to, which is the
  -- number that says whether a total came from one big night or from showing
  -- up all term. Counted here rather than in the lateral above, because that
  -- one runs per member and would only ever see one member's events at a time.
  -- Manual points have no event and are correctly not counted.
  esdeveniments_escola as (
    select p.escola, count(distinct s.event_id)::int as esdeveniments
      from public.profiles p
      join scored s on s.user_id = p.id
     where p.estat = 'actiu'
       and p.escola is not null
       and s.event_id is not null
       and (p_from is null or s.moment >= p_from)
       and (p_to   is null or s.moment <  p_to)
     group by p.escola
  )
  select
    pe.escola,
    pe.membres,
    coalesce(ee.esdeveniments, 0),
    pe.punts_totals,
    round(pe.punts_totals::numeric / nullif(pe.membres, 0), 2),
    rank() over (
      order by pe.punts_totals::numeric / nullif(pe.membres, 0) desc nulls last
    )::int
  from per_escola pe
  left join esdeveniments_escola ee on ee.escola = pe.escola
  where pe.membres >= 3
    and (select private.is_active_member())
$fn$;

comment on function public.ranking_escoles_period is
  'DEFINER BY DESIGN, same as public.ranking_period. Normalised by member '
  'count: a school of ninety and a school of forty cannot be compared on a raw '
  'total, and the competition dies the day the biggest school is permanently '
  'first. Members hidden from the individual ranking still count toward their '
  'school — nobody is identifiable inside a sum. The membres >= 3 floor stops '
  'a one-person school being de-anonymised by dividing.';

revoke all on function public.ranking_period(timestamptz, timestamptz)
  from public, anon;
revoke all on function public.ranking_escoles_period(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.ranking_period(timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function public.ranking_escoles_period(timestamptz, timestamptz)
  to authenticated, service_role;

-- ── the all-time views, now wrappers ────────────────────────────────────────
-- These were the two SECURITY DEFINER views in the schema, and the two the
-- Supabase advisor reported that everyone had to be told to ignore. A standing
-- "ignore this warning" is a bad thing to hand to a committee that changes
-- every year: the day somebody adds a third definer view by accident, the
-- report looks exactly like it always has.
--
-- The elevation moves into the functions, where it is one grant and one
-- comment each, and the views go back to being ordinary. The advisor's
-- security_definer_view list should now be empty, and any entry in it is a
-- real finding.
drop view if exists public.ranking;
drop view if exists public.ranking_escoles;

create view public.ranking
with (security_invoker = true, security_barrier = true) as
select * from public.ranking_period(null, null);

comment on view public.ranking is
  'The whole course, which is what most screens want. A window is '
  'public.ranking_period(from, to). The elevation lives in that function, not '
  'here.';

create view public.ranking_escoles
with (security_invoker = true, security_barrier = true) as
select * from public.ranking_escoles_period(null, null);

comment on view public.ranking_escoles is
  'The whole course. A window is public.ranking_escoles_period(from, to).';

alter view public.ranking owner to postgres;
alter view public.ranking_escoles owner to postgres;
revoke all on public.ranking from anon, authenticated;
revoke all on public.ranking_escoles from anon, authenticated;
grant select on public.ranking to authenticated, service_role;
grant select on public.ranking_escoles to authenticated, service_role;

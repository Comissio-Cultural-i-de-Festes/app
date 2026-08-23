-- The ranking periods, saved as one thing.
--
-- Migration 11 put the term boundaries in rows so the junta could move them
-- without a deploy, and then left the moving to the Supabase table editor.
-- That has three problems, and only the first is obvious.
--
-- 1. Four PATCHes are not one change. Between the second and the third the
--    ranking is served with half of last year's calendar and half of this
--    year's, and whoever is looking at it sees numbers that were never true.
--
-- 2. Nothing checks the shape. `ranking_periods_bounds` only looks at one row
--    at a time. Two terms that overlap count the same points twice; a gap
--    between two terms makes the points in it vanish from every term while
--    still showing up in the course total, which is the worse of the two
--    because nothing looks broken.
--
-- 3. `ordre` has no uniqueness and the app's default period is literally
--    `periods[0]`. Two rows with the same `ordre` and the home screen means a
--    different thing on each load, depending on what the planner felt like.
--
-- And underneath all three: today this can only be done by somebody with an
-- account on the Supabase dashboard, which is one person. Same argument as
-- letting an admin appoint another admin.

-- ── which rows form the chain, said out loud ────────────────────────────────
-- The terms are a chain: each one starts where the last one ended. The whole
-- course is not part of that chain — it deliberately spans all of them, and
-- checking it for overlaps would refuse the only correct arrangement there is.
--
-- The alternative was to infer it from `ends_at is null`, since the course row
-- is open-ended. That reads the same today and stops being true the first time
-- somebody gives the course an end date, at which point they get a refusal
-- about overlapping terms that names no term they recognise. A column says it
-- instead of implying it.
alter table public.ranking_periods
  add column if not exists mena text not null default 'tram'
  check (mena in ('tram', 'global'));

comment on column public.ranking_periods.mena is
  'A `tram` is a link in the chain of terms: they must run end to end, with no '
  'gap and no overlap. A `global` spans them — the whole course — and is '
  'exempt from that check by design.';

update public.ranking_periods set mena = 'global' where ends_at is null;

-- ── saving them ─────────────────────────────────────────────────────────────
create or replace function public.admin_save_periods(p_periods jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_bad   text;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  if jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) = 0 then
    raise exception 'cal una llista de periodes' using errcode = '22023';
  end if;

  -- Parsed once. Every check below reads this, so a payload that parses here
  -- is the payload that gets written — there is no second interpretation of
  -- the same JSON further down.
  create temporary table _periodes on commit drop as
  select
    r->>'codi'                                   as codi,
    nullif(btrim(coalesce(r->>'etiqueta', '')), '') as etiqueta,
    coalesce(r->>'mena', 'tram')                 as mena,
    (r->>'starts_at')::timestamptz               as starts_at,
    (r->>'ends_at')::timestamptz                 as ends_at,
    coalesce((r->>'ordre')::int, 0)              as ordre
  from jsonb_array_elements(p_periods) r;

  -- ── the rows themselves ───────────────────────────────────────────────────
  select string_agg(coalesce(codi, '(sense codi)'), ', ') into v_bad
    from pg_temp._periodes
   where codi is null or codi !~ '^[a-z][a-z0-9_]{0,23}$';
  if v_bad is not null then
    raise exception 'codi de periode invalid: %', v_bad using errcode = '22023';
  end if;

  select string_agg(codi, ', ') into v_bad
    from (select codi from pg_temp._periodes group by codi having count(*) > 1) d;
  if v_bad is not null then
    raise exception 'codi repetit: %', v_bad using errcode = '22023';
  end if;

  if exists (select 1 from pg_temp._periodes where mena not in ('tram', 'global')) then
    raise exception 'mena de periode invalida' using errcode = '22023';
  end if;

  -- `ordre` decides which chip the ranking opens on, and the app takes the
  -- first row. A tie there is not a cosmetic problem: the home screen means a
  -- different thing on each load.
  select string_agg(distinct ordre::text, ', ') into v_bad
    from (select ordre from pg_temp._periodes group by ordre having count(*) > 1) d;
  if v_bad is not null then
    raise exception 'dos periodes amb el mateix ordre: %', v_bad using errcode = '22023';
  end if;

  select string_agg(codi, ', ') into v_bad
    from pg_temp._periodes
   where starts_at is not null and ends_at is not null and ends_at <= starts_at;
  if v_bad is not null then
    raise exception 'un periode acaba abans de comencar: %', v_bad using errcode = '22023';
  end if;

  select string_agg(codi, ', ') into v_bad
    from pg_temp._periodes
   where mena = 'tram' and (starts_at is null or ends_at is null);
  if v_bad is not null then
    raise exception 'un trimestre necessita les dues dates: %', v_bad using errcode = '22023';
  end if;

  -- ── the chain ─────────────────────────────────────────────────────────────
  -- One predicate for both failures. Sorted by start, the next term must begin
  -- exactly where this one ends: earlier is an overlap and the points in it are
  -- counted twice, later is a gap and they disappear from every term while
  -- still being in the course total.
  select string_agg(codi || ' → ' || seguent, ', ') into v_bad
    from (
      select
        codi,
        ends_at,
        lead(codi)      over (order by starts_at) as seguent,
        lead(starts_at) over (order by starts_at) as seguent_inici
      from pg_temp._periodes
      where mena = 'tram'
    ) c
   where seguent is not null and seguent_inici <> ends_at;
  if v_bad is not null then
    raise exception 'els trimestres han d''anar seguits, sense forats ni solapaments: %', v_bad
      using errcode = '22023';
  end if;

  -- ── the write, which is now the only statement that can half-happen ───────
  delete from public.ranking_periods
   where codi not in (select codi from pg_temp._periodes);

  insert into public.ranking_periods (codi, etiqueta, mena, starts_at, ends_at, ordre)
  select codi, etiqueta, mena, starts_at, ends_at, ordre from pg_temp._periodes
  on conflict (codi) do update
    set etiqueta  = excluded.etiqueta,
        mena      = excluded.mena,
        starts_at = excluded.starts_at,
        ends_at   = excluded.ends_at,
        ordre     = excluded.ordre;

  select count(*) into v_count from pg_temp._periodes;

  -- The whole calendar, not a diff. It is four rows, and the question this
  -- answers in March is "what did it say in October", which a diff cannot.
  insert into public.audit_log (actor_id, accio, detall)
  values (
    (select auth.uid()),
    'save_periods',
    jsonb_build_object('quants', v_count, 'periodes', p_periods)
  );

  drop table pg_temp._periodes;
end $$;

comment on function public.admin_save_periods(jsonb) is
  'Writes the whole ranking calendar in one statement, or none of it. Refuses '
  'a chain of terms with a gap or an overlap, two periods sharing an `ordre`, '
  'and a term missing a bound. Audited: moving a term boundary silently '
  'restates every score on the home screen.';

alter function public.admin_save_periods(jsonb) owner to postgres;
revoke all on function public.admin_save_periods(jsonb) from public, anon;
grant execute on function public.admin_save_periods(jsonb) to authenticated;

-- ── and the way round it goes away ──────────────────────────────────────────
-- Order matters and it is the way round it is written: the function above
-- exists before the grants below are taken away, so there is never a state
-- where the junta has no way in. Privileges are checked before RLS, so the
-- revoke is what actually closes the direct path; dropping the policy on its
-- own would leave the grant sitting there for the next person to re-enable a
-- policy against.
drop policy if exists rperiods_write_admin on public.ranking_periods;
revoke insert, update, delete on public.ranking_periods from authenticated;

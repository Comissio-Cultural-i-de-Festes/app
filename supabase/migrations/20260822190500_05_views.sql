-- Views.
--
-- events_public is presentation, and is `security_invoker = true` so both base
-- tables' policies still apply to whoever is asking. The ranking views are
-- `security_invoker = false` because they have to publish aggregates over a
-- ledger nobody may read row by row — that is the one place in this schema
-- where elevation is the point.

-- ── events_public ───────────────────────────────────────────────────────────
-- One row per published event, always. Before reveal_at the join finds no
-- event_details row for a member, so the detail columns come back NULL; after
-- it, the whole thing. An admin sees everything at every stage.
--
-- No SECURITY DEFINER anywhere in this path. If someone adds a policy later,
-- the view inherits it, which is the behaviour that does not surprise anyone.
create view public.events_public
with (security_invoker = true, security_barrier = true) as
select
  e.id,
  e.titulo,
  e.tipo,
  e.starts_at,
  e.teaser,
  e.reveal_at,
  (e.reveal_at is null or e.reveal_at <= now()) as revelat,
  e.plazas,
  e.precio_cents,
  e.puntos,
  e.published,
  e.created_by,
  e.created_at,
  d.descripcion,
  d.ubicacion,
  d.ends_at,
  d.cover_url,
  d.transport_info
from public.events e
left join public.event_details d on d.event_id = e.id;

comment on view public.events_public is
  'The listing shape. Detail columns are NULL until reveal_at, because the '
  'event_details row is filtered out by its own policy, not by a CASE here. '
  'security_invoker = true: this view is presentation, not a boundary.';

alter view public.events_public owner to postgres;
revoke all on public.events_public from anon, authenticated;
grant select on public.events_public to authenticated, service_role;

-- ── ranking ─────────────────────────────────────────────────────────────────
-- points_log rows are private to their owner, so an invoker view over them
-- would show every member a leaderboard containing only themselves. Something
-- has to run elevated; a view is the safest thing that can, because its object
-- references are resolved at creation time and it takes no parameters, so
-- there is no search_path surface and nothing user-controlled inside.
create view public.ranking
with (security_invoker = false, security_barrier = true) as
select
  p.id as user_id,
  p.nombre,
  p.avatar_url,
  p.escola,
  coalesce(sum(pl.puntos), 0)::int as punts,
  rank() over (order by coalesce(sum(pl.puntos), 0) desc)::int as posicio
from public.profiles p
left join public.points_log pl on pl.user_id = p.id
where p.estat = 'actiu'
  and p.hide_from_ranking = false
  and (select private.is_active_member())
group by p.id, p.nombre, p.avatar_url, p.escola;

comment on view public.ranking is
  'DEFINER BY DESIGN (security_invoker = false). Publishes per-member totals '
  'over points_log, which no client may read row by row. Supabase advisor '
  '0010_security_definer_view flags this; the exception is intended and '
  'reviewed, and this view plus ranking_escoles are the only two allowed to '
  'appear in that report. Do not add a non-aggregated column.';

alter view public.ranking owner to postgres;
revoke all on public.ranking from anon, authenticated;
grant select on public.ranking to authenticated, service_role;

-- Three properties make hide_from_ranking unbypassable, and all three are
-- needed:
--   1. the predicate is in the view's own WHERE, which no client filter can
--      opt out of;
--   2. the column is not in the output, so there is nothing to filter on and
--      no way to tell "hidden" from "does not exist";
--   3. the filter runs BEFORE the window function. Ranking everyone and
--      filtering afterwards would leave visible gaps in the position
--      sequence, which reveals both that someone is hidden and roughly where
--      they sit.

-- ── ranking_escoles ─────────────────────────────────────────────────────────
-- Normalised by member count. A school with 90 people and one with 40 cannot
-- be compared on a raw total, and the competition dies the moment the biggest
-- school is permanently first.
create view public.ranking_escoles
with (security_invoker = false, security_barrier = true) as
with per_escola as (
  select
    p.escola,
    count(*)::int as membres,
    coalesce(sum(t.punts), 0)::int as punts_totals
  from public.profiles p
  left join lateral (
    select sum(pl.puntos)::int as punts
    from public.points_log pl
    where pl.user_id = p.id
  ) t on true
  where p.estat = 'actiu' and p.escola is not null
  group by p.escola
)
select
  escola,
  membres,
  punts_totals,
  round(punts_totals::numeric / nullif(membres, 0), 2) as punts_per_membre,
  rank() over (
    order by punts_totals::numeric / nullif(membres, 0) desc nulls last
  )::int as posicio
from per_escola
where membres >= 3
  and (select private.is_active_member());

comment on view public.ranking_escoles is
  'DEFINER BY DESIGN, same as public.ranking. Members hidden from the '
  'individual ranking still count toward their school: nobody is identifiable '
  'in a sum. The membres >= 3 floor stops a one-person school being '
  'de-anonymised by dividing.';

alter view public.ranking_escoles owner to postgres;
revoke all on public.ranking_escoles from anon, authenticated;
grant select on public.ranking_escoles to authenticated, service_role;

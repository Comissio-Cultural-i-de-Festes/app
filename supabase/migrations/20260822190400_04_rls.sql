-- Row level security.
--
-- Conventions used throughout:
--   * One policy per (command, audience). No catch-all `for all`.
--   * `to authenticated` everywhere: anon has no policy and no grant.
--   * USING and WITH CHECK both written out on every UPDATE. A FOR UPDATE
--     policy with no WITH CHECK silently reuses its USING expression, and
--     relying on that is how a row ends up movable onto someone else's user_id.
--   * Zero-argument helpers are wrapped in `(select ...)` so the planner
--     evaluates them once per query instead of once per row. On a 300-row
--     attendance list that is one lookup against profiles instead of 300.
--     Row-dependent helpers are NOT wrapped: they cannot be InitPlans.
--   * Scheduled content is filtered with Postgres now(). Never a device clock,
--     and never an `if` in React — a client-side check is visible in the
--     network tab regardless of what the UI draws.

-- ── profiles ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- A 'pendent' user can see and complete their own row and nothing else.
create policy profiles_select_directory on public.profiles
  for select to authenticated
  using ((select private.is_active_member()) and estat = 'actiu');

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using ((select private.is_admin()));

-- Looks far too wide, and is not: the column grant in 03_grants.sql means the
-- only columns an authenticated session can even name in a SET list are
-- nombre, avatar_url, escola, grau, curs and hide_from_ranking.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- So the junta can fix a misspelled name. Bound by the same column grant, so
-- it cannot reach role or estat either.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- No INSERT policy: rows are created by the trigger on auth.users.
-- No DELETE policy: members are deactivated, never deleted.

-- ── profile_secret ──────────────────────────────────────────────────────────
alter table public.profile_secret enable row level security;

-- This is the entire policy set for the table, and the absence of an admin
-- one is the point. The junta never needs to read a token: check_in() resolves
-- it inside a definer function. Nobody writes here from a client either;
-- rotation goes through public.rotate_qr_token().
create policy psecret_select_self on public.profile_secret
  for select to authenticated
  using (id = (select auth.uid()));

-- ── profile_contact ─────────────────────────────────────────────────────────
alter table public.profile_contact enable row level security;

create policy pcontact_select_self on public.profile_contact
  for select to authenticated
  using (id = (select auth.uid()));

-- The junta reads phone numbers to reconcile against the WhatsApp group. The
-- rest of the association does not.
create policy pcontact_select_admin on public.profile_contact
  for select to authenticated
  using ((select private.is_admin()));

create policy pcontact_update_self on public.profile_contact
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── invites ─────────────────────────────────────────────────────────────────
alter table public.invites enable row level security;

create policy invites_select_admin on public.invites
  for select to authenticated
  using ((select private.is_admin()));

create policy invites_insert_admin on public.invites
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));

create policy invites_update_admin on public.invites
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter table public.invite_uses enable row level security;

create policy invite_uses_select_self on public.invite_uses
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy invite_uses_select_admin on public.invite_uses
  for select to authenticated
  using ((select private.is_admin()));

-- ── events ──────────────────────────────────────────────────────────────────
alter table public.events enable row level security;

-- Published events are visible from the moment they are published, reveal or
-- not: that is the whole point of a teaser. What stays hidden is
-- event_details.
create policy events_select_member on public.events
  for select to authenticated
  using ((select private.is_active_member()) and published);

create policy events_select_admin on public.events
  for select to authenticated
  using ((select private.is_admin()));

create policy events_insert_admin on public.events
  for insert to authenticated
  with check ((select private.is_admin()) and created_by = (select auth.uid()));

create policy events_update_admin on public.events
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy events_delete_admin on public.events
  for delete to authenticated
  using ((select private.is_admin()));

-- ── event_details ───────────────────────────────────────────────────────────
alter table public.event_details enable row level security;

-- The reveal, as an ordinary row predicate. Before reveal_at the row simply is
-- not there for a member: no CASE expression to forget to update, and a
-- column added to this table next term is gated automatically.
create policy edetails_select_member on public.event_details
  for select to authenticated
  using ((select private.is_active_member()) and private.event_is_revealed(event_id));

create policy edetails_select_admin on public.event_details
  for select to authenticated
  using ((select private.is_admin()));

create policy edetails_insert_admin on public.event_details
  for insert to authenticated
  with check ((select private.is_admin()));

create policy edetails_update_admin on public.event_details
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy edetails_delete_admin on public.event_details
  for delete to authenticated
  using ((select private.is_admin()));

-- ── event_content ───────────────────────────────────────────────────────────
alter table public.event_content enable row level security;

-- `visible_from is not null` is deliberate: an unscheduled block is hidden,
-- not public. Getting that backwards would publish the gymkhana rules the
-- moment someone forgot to set a date. A trigger fills in a sensible default.
create policy econtent_select_member on public.event_content
  for select to authenticated
  using (
    (select private.is_active_member())
    and private.event_is_published(event_id)
    and visible_from is not null
    and visible_from <= now()
  );

create policy econtent_select_admin on public.event_content
  for select to authenticated
  using ((select private.is_admin()));

create policy econtent_insert_admin on public.event_content
  for insert to authenticated
  with check ((select private.is_admin()));

create policy econtent_update_admin on public.event_content
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy econtent_delete_admin on public.event_content
  for delete to authenticated
  using ((select private.is_admin()));

-- ── attendances ─────────────────────────────────────────────────────────────
alter table public.attendances enable row level security;

create policy att_select_self on public.attendances
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The public list. Only 'si' and 'asistio' — a public list of who said no is
-- pointing at people, and 'potser' is where the junta does its nudging.
-- 'espera' and 'cancelado' are private by default, which fails closed.
create policy att_select_public_si on public.attendances
  for select to authenticated
  using (
    (select private.is_active_member())
    and estado in ('si', 'asistio')
    and private.event_is_published(event_id)
  );

create policy att_select_admin on public.attendances
  for select to authenticated
  using ((select private.is_admin()));

create policy att_insert_self on public.attendances
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado in ('si', 'potser', 'no')
    and private.event_is_published(event_id)
  );

-- The WITH CHECK matters on its own: with USING alone, a member could move
-- their own row onto somebody else's user_id.
create policy att_update_self on public.attendances
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and estado not in ('asistio', 'cancelado')
  )
  with check (
    user_id = (select auth.uid())
    and estado in ('si', 'potser', 'no')
  );

create policy att_update_admin on public.attendances
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy att_delete_self on public.attendances
  for delete to authenticated
  using (user_id = (select auth.uid()) and estado not in ('asistio', 'cancelado'));

create policy att_delete_admin on public.attendances
  for delete to authenticated
  using ((select private.is_admin()));

-- ── rides ───────────────────────────────────────────────────────────────────
alter table public.rides enable row level security;

-- Gated on reveal, not merely publication: an offer to drive to a place at a
-- time gives away the shape of a surprise.
create policy rides_select_member on public.rides
  for select to authenticated
  using ((select private.is_active_member()) and private.event_is_revealed(event_id));

create policy rides_select_admin on public.rides
  for select to authenticated
  using ((select private.is_admin()));

create policy rides_insert_driver on public.rides
  for insert to authenticated
  with check (
    driver_id = (select auth.uid())
    and (select private.is_active_member())
    and private.event_is_revealed(event_id)
  );

create policy rides_update_driver on public.rides
  for update to authenticated
  using (driver_id = (select auth.uid()) and (select private.is_active_member()))
  with check (driver_id = (select auth.uid()));

create policy rides_update_admin on public.rides
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy rides_delete_driver on public.rides
  for delete to authenticated
  using (driver_id = (select auth.uid()));

create policy rides_delete_admin on public.rides
  for delete to authenticated
  using ((select private.is_admin()));

alter table public.ride_seats enable row level security;

create policy rseats_select_member on public.ride_seats
  for select to authenticated
  using ((select private.is_active_member()) and private.ride_is_visible(ride_id));

create policy rseats_select_admin on public.ride_seats
  for select to authenticated
  using ((select private.is_admin()));

create policy rseats_delete_self on public.ride_seats
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy rseats_delete_driver on public.ride_seats
  for delete to authenticated
  using (private.is_ride_driver(ride_id));

create policy rseats_delete_admin on public.ride_seats
  for delete to authenticated
  using ((select private.is_admin()));

-- No insert policy: public.join_ride() only.

-- ── proposals ───────────────────────────────────────────────────────────────
alter table public.proposals enable row level security;

create policy prop_select_member on public.proposals
  for select to authenticated
  using ((select private.is_active_member()));

create policy prop_select_admin on public.proposals
  for select to authenticated
  using ((select private.is_admin()));

create policy prop_insert_self on public.proposals
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_member()));

create policy prop_update_self on public.proposals
  for update to authenticated
  using (user_id = (select auth.uid()) and estat = 'oberta')
  with check (user_id = (select auth.uid()) and estat = 'oberta');

create policy prop_update_admin on public.proposals
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy prop_delete_self on public.proposals
  for delete to authenticated
  using (user_id = (select auth.uid()) and estat = 'oberta');

create policy prop_delete_admin on public.proposals
  for delete to authenticated
  using ((select private.is_admin()));

-- Votes are secret; only the tally on proposals.vots is public.
alter table public.proposal_votes enable row level security;

create policy pv_select_self on public.proposal_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy pv_select_admin on public.proposal_votes
  for select to authenticated
  using ((select private.is_admin()));

create policy pv_insert_self on public.proposal_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_active_member())
    and private.proposal_is_open(proposal_id)
  );

create policy pv_delete_self on public.proposal_votes
  for delete to authenticated
  using (user_id = (select auth.uid()) and private.proposal_is_open(proposal_id));

create policy pv_delete_admin on public.proposal_votes
  for delete to authenticated
  using ((select private.is_admin()));

-- ── points_log ──────────────────────────────────────────────────────────────
alter table public.points_log enable row level security;

create policy plog_select_self on public.points_log
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy plog_select_admin on public.points_log
  for select to authenticated
  using ((select private.is_admin()));

-- No INSERT, UPDATE or DELETE policy exists, and 03_grants.sql withheld the
-- matching privileges. Both layers deny on their own. Awards go through
-- public.award_points() and public.check_in().

-- ── audit_log ───────────────────────────────────────────────────────────────
alter table public.audit_log enable row level security;

create policy audit_select_admin on public.audit_log
  for select to authenticated
  using ((select private.is_admin()));

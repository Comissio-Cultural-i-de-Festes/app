-- Privileges. This file, not the policy file, is where the strongest controls
-- in the schema live.
--
-- Column privileges are checked BEFORE RLS, so a policy bug cannot open them,
-- and they fail closed for columns added later. That is why `role` and `estat`
-- are protected here rather than by a WITH CHECK clause: RLS cannot compare
-- NEW to OLD, and a policy that enumerates safe columns silently starts
-- letting through whatever gets added next term.
--
-- One thing grants cannot express: admins and members are the SAME database
-- role (`authenticated`). "Admins may write role, members may not" is
-- therefore impossible here, and every privileged write goes through a
-- security definer RPC in 06_functions.sql instead. That is not a workaround —
-- it is where the last-owner guard, the no-self-promotion rule and the audit
-- entry belong anyway.

-- Postgres grants EXECUTE on new functions in public to PUBLIC all by itself,
-- independently of Supabase. Close it and hand each RPC back one at a time.
revoke execute on all functions in schema public from public, anon, authenticated;

-- ── profiles ────────────────────────────────────────────────────────────────
revoke all on public.profiles from anon, authenticated;

-- No SELECT on qr_token (a bearer credential for check-in) or telefon
-- (personal data). Both come back through a narrow RPC.
grant select (
  id, nombre, avatar_url, escola, grau, curs, estat, role, hide_from_ranking, created_at
) on public.profiles to authenticated;

grant update (
  nombre, avatar_url, escola, grau, curs, hide_from_ranking
) on public.profiles to authenticated;
-- Absent on purpose: insert, delete, and update on id / estat / role /
-- qr_token / telefon / created_at.
--
-- telefon is left out of the UPDATE list too, so it is set through
-- public.set_my_phone(). Keeping it out of the general update means the
-- onboarding form cannot accidentally clear it.

-- ── invites ─────────────────────────────────────────────────────────────────
revoke all on public.invites from anon, authenticated;
grant select, insert, update on public.invites to authenticated; -- RLS: admin only
-- No delete: revoking is `revoked = true`, which keeps the trail of who
-- invited whom, which is what the points for bringing people new rely on.

revoke all on public.invite_uses from anon, authenticated;
grant select on public.invite_uses to authenticated;
-- Writes only through public.redeem_invite().

-- ── events ──────────────────────────────────────────────────────────────────
revoke all on public.events from anon, authenticated;
grant select, insert, update, delete on public.events to authenticated; -- RLS gates writes

revoke all on public.event_details from anon, authenticated;
grant select, insert, update, delete on public.event_details to authenticated;

revoke all on public.event_content from anon, authenticated;
grant select, insert, update, delete on public.event_content to authenticated;

-- ── attendances ─────────────────────────────────────────────────────────────
revoke all on public.attendances from anon, authenticated;
grant select on public.attendances to authenticated;
grant insert (user_id, event_id, estado) on public.attendances to authenticated;
grant update (estado) on public.attendances to authenticated;
grant delete on public.attendances to authenticated;
-- pagado, checked_in_at, checked_in_by, entry_photo_url, exit_photo_url and
-- was_registered are not writable by any client. Checking yourself in is the
-- single most valuable bypass in the system and it is closed at the privilege
-- layer, not just by a policy.

-- ── rides ───────────────────────────────────────────────────────────────────
revoke all on public.rides from anon, authenticated;
grant select on public.rides to authenticated;
grant insert (event_id, driver_id, sentit, origen, hora_sortida, places, notes)
  on public.rides to authenticated;
grant update (origen, hora_sortida, places, notes) on public.rides to authenticated;
grant delete on public.rides to authenticated;
-- sentit and event_id are deliberately not updatable: changing either strands
-- whoever already took a seat.

revoke all on public.ride_seats from anon, authenticated;
grant select, delete on public.ride_seats to authenticated;
-- No insert: seats are a hard physical cap, so they go through
-- public.join_ride(), which locks the ride row. A WITH CHECK cannot count
-- concurrent inserts.

-- ── proposals ───────────────────────────────────────────────────────────────
revoke all on public.proposals from anon, authenticated;
grant select on public.proposals to authenticated;
grant insert (user_id, titol, descripcio) on public.proposals to authenticated;
grant update (titol, descripcio) on public.proposals to authenticated;
grant delete on public.proposals to authenticated;
-- estat, event_id and vots are system columns.

revoke all on public.proposal_votes from anon, authenticated;
grant select on public.proposal_votes to authenticated;
grant insert (proposal_id, user_id) on public.proposal_votes to authenticated;
grant delete on public.proposal_votes to authenticated;

-- ── points_log ──────────────────────────────────────────────────────────────
revoke all on public.points_log from anon, authenticated;
grant select on public.points_log to authenticated;
-- No insert, update or delete privilege AND no corresponding policy. Both
-- layers deny independently, so neither one being wrong is enough to open it.

-- ── audit_log ───────────────────────────────────────────────────────────────
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated; -- RLS: admin only

-- anon gets no table access whatsoever. Its one need, checking an invitation
-- code before someone bothers creating an account, is a single RPC granted in
-- 06_functions.sql. Schema USAGE stays: PostgREST's introspection assumes it.

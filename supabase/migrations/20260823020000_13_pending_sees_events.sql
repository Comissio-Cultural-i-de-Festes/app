-- Somebody waiting for approval sees the calendar.
--
-- The door now says so out loud: "Fins que t'aprovin veus els esdeveniments,
-- però no pots apuntar-t'hi." Until this migration that sentence was false —
-- events_select_member asked for estat = 'actiu', so a pending profile opened
-- the app to nothing at all and had no way to tell an empty association from a
-- closed one.
--
-- WHAT THIS DOES AND DOES NOT OPEN. Only public.events, which is titles,
-- dates, teasers and how many places there are. Everything else keeps asking
-- for an active membership:
--
--   event_details   the location and the description, still gated on reveal
--   attendances     who is coming, including the public "si" list
--   ranking         both of them, and ranking_periods with them
--   answering       set_attendance and the insert policy underneath it
--
-- So a pending person sees that there is a party on the 25th and nothing about
-- where it is or who will be there.
--
-- THE COST, stated plainly: anybody with a Google account who reaches the app
-- can now see what the association has planned. That is a real widening of the
-- gate and it was decided deliberately — an empty app is a worse first
-- impression than a visible one you cannot join yet, and the invitation still
-- controls everything that matters.

create or replace function private.is_member_or_pending()
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.estat in ('pendent', 'actiu')
  )
$$;

comment on function private.is_member_or_pending is
  'True for somebody who has a profile and has not been given the boot — so '
  'active members and people still waiting for approval, but not estat = '
  '''baixa''. Only public.events uses this. Everywhere else wants '
  'private.is_active_member(), which is the one that means admitted.';

-- Same grant as every other helper in `private`: the policies call it as the
-- caller, so `authenticated` needs EXECUTE or the policy denies everybody. It
-- takes no arguments and only reports on whoever is asking, so there is
-- nothing to leak — "am I approved yet?" tells you what you already know.
revoke all on function private.is_member_or_pending() from public, anon;
grant execute on function private.is_member_or_pending() to authenticated;

drop policy events_select_member on public.events;

create policy events_select_member on public.events
  for select to authenticated
  using ((select private.is_member_or_pending()) and published);

comment on table public.events is
  'The always-public half of an event: enough for a teaser and a countdown. '
  'Readable by members AND by people still waiting for approval, which is what '
  'the door promises them. Everything that has to stay hidden until reveal_at '
  'lives in event_details, and that one is members only.';

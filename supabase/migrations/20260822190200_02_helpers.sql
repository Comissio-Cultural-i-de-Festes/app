-- Role predicates used by the policies.
--
-- Why these are security definer functions rather than a subquery in each
-- policy, in order of how badly it goes wrong:
--
-- 1. Recursion. A policy on `profiles` whose expression selects from
--    `profiles` makes Postgres re-apply the same policies to evaluate it and
--    aborts with "infinite recursion detected in policy for relation
--    profiles". Not a subtle misbehaviour: a hard error.
--
-- 2. Silent coupling. A table reference inside ANY policy expression is itself
--    subject to that table's RLS. `exists (select 1 from events ...)` inside
--    event_content's policy is filtered by events' policies for the current
--    user, so tightening events later changes event_content's behaviour
--    without anyone touching it.
--
-- 3. Authority. The role lookup has to be true even for a user whose own
--    profiles policy is restrictive.
--
-- `set search_path = ''` is mandatory: without it the caller's search_path
-- decides which `profiles` gets read, which is a privilege-escalation
-- primitive. Everything inside is therefore schema-qualified.
--
-- Considered and rejected: putting the role in the JWT via a custom access
-- token hook. No database lookup at all, but the claim is stale until the
-- token refreshes, so a demoted admin — or a member set to 'baixa' — keeps
-- full powers for up to an hour. For an authorisation *and* an approval gate
-- that is not acceptable.

create or replace function private.member_role()
returns text
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.estat = 'actiu'
$$;

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.estat = 'actiu'
  )
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select coalesce(private.member_role() in ('admin', 'owner'), false)
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select coalesce(private.member_role() = 'owner', false)
$$;

-- Row-dependent predicates. These cannot become InitPlans, so they must stay
-- cheap: each is a single primary-key or indexed probe.

create or replace function private.event_is_published(p_event_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.events e where e.id = p_event_id and e.published
  )
$$;

create or replace function private.event_is_revealed(p_event_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and e.published
      and (e.reveal_at is null or e.reveal_at <= now())
  )
$$;

create or replace function private.ride_is_visible(p_ride_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id and private.event_is_revealed(r.event_id)
  )
$$;

create or replace function private.is_ride_driver(p_ride_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id = p_ride_id and r.driver_id = (select auth.uid())
  )
$$;

create or replace function private.proposal_is_open(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from public.proposals p
    where p.id = p_proposal_id and p.estat = 'oberta'
  )
$$;

-- The zero-argument helpers only report on the caller, so granting execute
-- leaks nothing: asking "am I an admin?" tells you what you already know.
do $$
declare fn text;
begin
  for fn in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

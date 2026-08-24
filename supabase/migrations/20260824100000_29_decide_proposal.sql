-- Deciding an idea, and saying why.
--
-- The tables, the policies, the column grants and the vote-tally trigger have
-- been here since the first migration. Three things were missing, and the
-- third is the one that matters.
--
--   1. There was nowhere to write the reason.
--   2. Every member could see every proposal, including the turned-down ones.
--   3. There was no way to decide at all: `authenticated` holds UPDATE on
--      `titol` and `descripcio` and on nothing else, so not even an admin can
--      move `estat` from a client. The `prop_update_admin` policy has been
--      unreachable since the day it was written.

-- ── 1. somewhere to put the why ─────────────────────────────────────────────
-- Required to turn something down. Somebody who bothers to propose an evening
-- deserves a sentence and not just a stamp, and "why yes" is worth saying too.
alter table public.proposals
  add column if not exists nota_junta text
    check (nota_junta is null or length(btrim(nota_junta)) between 1 and 500);

alter table public.proposals add column if not exists decided_by uuid
  references public.profiles (id) on delete set null;

alter table public.proposals add column if not exists decided_at timestamptz;

comment on column public.proposals.nota_junta is
  'Why the junta accepted or turned it down. On a turned-down proposal this '
  'row is only visible to its author, so the column needs no filter of its '
  'own — see prop_select_member.';

-- ── 2. a turned-down idea is nobody else's business ─────────────────────────
-- The old policy published every proposal to every member. That makes the
-- list of ideas a public list of people's ideas with a "no" beside them, which
-- is a different and worse thing than a leaderboard.
--
-- Open and accepted stay public: the first is what everybody votes on and the
-- second is why an event exists.
drop policy prop_select_member on public.proposals;

create policy prop_select_member on public.proposals
  for select to authenticated
  using (
    (select private.is_active_member())
    and (
      estat in ('oberta', 'acceptada')
      or user_id = (select auth.uid())
    )
  );

-- The three new columns need naming in the SELECT grant or nobody can read
-- them: the grant on this table is per-column, not table-wide.
grant select (nota_junta, decided_by, decided_at) on public.proposals to authenticated;

-- ── 3. deciding ─────────────────────────────────────────────────────────────
create or replace function public.admin_decide_proposal(
  p_id uuid,
  p_accepta boolean,
  p_nota text default null,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prop  public.proposals%rowtype;
  v_nota  text := nullif(btrim(coalesce(p_nota, '')), '');
  v_punts int;
begin
  if not private.is_admin() then
    raise exception 'nomes junta' using errcode = '42501';
  end if;

  -- Refused here rather than left to the screen, because the reason is the
  -- whole point of the column and a screen is one deploy away from forgetting.
  if not p_accepta and v_nota is null then
    raise exception 'cal dir per que no' using errcode = '22023';
  end if;

  if p_accepta then
    if p_event_id is null then
      raise exception 'cal l''esdeveniment en que es converteix' using errcode = '22023';
    end if;
    if not exists (select 1 from public.events where id = p_event_id) then
      raise exception 'esdeveniment inexistent' using errcode = '22023';
    end if;
  end if;

  select * into v_prop from public.proposals where id = p_id for update;
  if not found then
    raise exception 'proposta inexistent' using errcode = 'P0002';
  end if;

  -- Not an error: two admins looking at the same list on a Sunday evening.
  -- Returning what it already was is more use than a constraint violation,
  -- and it is what stops the points being paid twice.
  if v_prop.estat <> 'oberta' then
    return jsonb_build_object('estat', 'ja_decidida', 'era', v_prop.estat);
  end if;

  update public.proposals
     set estat      = case when p_accepta then 'acceptada' else 'descartada' end,
         event_id   = case when p_accepta then p_event_id end,
         nota_junta = v_nota,
         decided_by = (select auth.uid()),
         decided_at = now()
   where id = p_id;

  -- Read from the scale at the moment of deciding rather than written in here:
  -- the junta moves that number from /junta/barem and this has to follow it. A
  -- scale set to zero means no award, not a constraint violation from
  -- award_points, which refuses zero.
  if p_accepta then
    select punts into v_punts
      from public.point_values where mena = 'motiu' and clau = 'propuso';

    if coalesce(v_punts, 0) > 0 then
      perform public.award_points(
        v_prop.user_id, p_event_id, 'propuso', v_punts,
        'proposta: ' || v_prop.titol
      );
    end if;
  end if;

  insert into public.audit_log (actor_id, accio, target_id, detall)
  values (
    (select auth.uid()),
    'decide_proposal',
    p_id,
    jsonb_build_object(
      'titol', v_prop.titol,
      'autor', v_prop.user_id,
      'accepta', p_accepta,
      'esdeveniment', p_event_id,
      'punts', case when p_accepta then coalesce(v_punts, 0) else 0 end
    )
  );

  return jsonb_build_object(
    'estat', case when p_accepta then 'acceptada' else 'descartada' end,
    'punts', case when p_accepta then coalesce(v_punts, 0) else 0 end
  );
end $$;

comment on function public.admin_decide_proposal(uuid, boolean, text, uuid) is
  'Turns an idea into an event or turns it down. Refuses to turn one down '
  'without a reason. Awards whatever the barem says `propuso` is worth, read '
  'when deciding rather than hardcoded. Deciding an already-decided proposal '
  'returns what it was instead of paying again. Audited.';

alter function public.admin_decide_proposal(uuid, boolean, text, uuid) owner to postgres;
revoke all on function public.admin_decide_proposal(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.admin_decide_proposal(uuid, boolean, text, uuid) to authenticated;

-- The policy that could never fire. Deciding is the RPC's job now, and leaving
-- a dead `for all`-shaped policy behind is how somebody later re-enables a
-- path with no audit trail.
drop policy prop_update_admin on public.proposals;

-- ── 4. withdrawing your own idea, while it is still only yours ──────────────
-- The old rule was "while it is open". The screen says something stricter and
-- better: while nobody has voted for it. Once people have backed an idea,
-- taking it away is taking away their vote too.
drop policy prop_delete_self on public.proposals;

create policy prop_delete_self on public.proposals
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and estat = 'oberta'
    and vots = 0
  );

-- The invitation screen shows how long the code has left ("Caduca en 41 h"),
-- so the pre-auth check has to return it.
--
-- This does not widen anything: the caller already holds the code, and knowing
-- when their own invitation expires tells them nothing about anybody else. The
-- property that matters is preserved — a wrong code, a revoked one and an
-- exhausted one still answer identically, so a code cannot be probed for
-- having once been real.
create or replace function public.invite_preview(p_codi text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v record;
begin
  select i.revoked,
         i.expires_at,
         i.max_usos,
         (select count(*) from public.invite_uses u where u.invite_id = i.id) as usos
    into v
  from public.invites i
  where i.codi = p_codi;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  if v.revoked
     or (v.expires_at is not null and v.expires_at <= now())
     or (v.max_usos is not null and v.usos >= v.max_usos)
  then
    -- Deliberately the same shape as "no such code".
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object('valid', true, 'expires_at', v.expires_at);
end $$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

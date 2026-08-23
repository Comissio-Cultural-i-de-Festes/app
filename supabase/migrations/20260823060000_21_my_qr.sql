-- my_qr(), which had two ways of returning nothing and no way of saying why.
--
-- It returned NULL when the profile was not active and NULL when the
-- profile_secret row was missing. The client cannot tell either of those from
-- a request that never arrived, so both came out as "we cannot show your code,
-- try again with a connection" — on a phone with four bars, to somebody whose
-- only real problem is that nobody has approved them yet.
--
-- Now it says which. And the second case cannot happen any more: the row is
-- minted on demand rather than depended upon.

create or replace function public.my_qr()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_estat text;
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'cal sessio' using errcode = '42501';
  end if;

  select p.estat into v_estat from public.profiles p where p.id = v_uid;

  if not found then
    raise exception 'sense perfil' using errcode = 'P0002';
  end if;

  -- A distinct code, because the screen has something specific and useful to
  -- say for it and nothing useful to say about the network.
  if v_estat <> 'actiu' then
    raise exception 'perfil no actiu: %', v_estat using errcode = 'P0001';
  end if;

  -- The trigger on auth.users creates this row, and an account that predates
  -- the trigger — or one created while it was briefly inert — has none. That
  -- used to be a permanent dead end with a misleading message; here it is a
  -- row that gets written the first time somebody looks.
  insert into public.profile_secret (id) values (v_uid) on conflict (id) do nothing;

  select s.qr_token into v_token from public.profile_secret s where s.id = v_uid;
  return v_token;
end $$;

comment on function public.my_qr() is
  'The member''s own door token. Raises P0001 when the profile is not active '
  'and P0002 when there is no profile at all, so the screen can say which '
  'rather than blaming the connection. Mints the profile_secret row if it is '
  'missing, which is why it is volatile.';

alter function public.my_qr() owner to postgres;
revoke all on function public.my_qr() from public, anon;
grant execute on function public.my_qr() to authenticated;

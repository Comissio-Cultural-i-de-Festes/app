-- Sign in with Google replaces the magic link.
--
-- Not a preference: there is no association domain, so there is no verified
-- sender, so no real email can go out. Supabase's built-in SMTP is two
-- messages an hour and the first event is about a hundred sign-ups in one
-- evening. Google needs no email at all.
--
-- The gate does not move. Google says who somebody is; whether they are in the
-- association is still decided by public.redeem_invite(), and a profile still
-- arrives as 'pendent'.

-- The address Google returns. It goes in profile_contact rather than profiles
-- for the same reason the phone number does: the junta needs it to reach
-- people, the whole association does not.
--
-- Not writable by a client. It is an identity fact from the provider, not a
-- preference — unlike telefon, which members set themselves. The alternate
-- address for somebody who graduates will be a separate, writable column.
alter table public.profile_contact add column correu text;

comment on column public.profile_contact.correu is
  'The address the identity provider returned at signup. Written by the '
  'trigger on auth.users, never by a client. auth.users.email is the source of '
  'truth; this is the copy the junta can actually read, since nothing in the '
  'app may query the auth schema.';

-- Rewritten to take what Google gives us. The literals are the load-bearing
-- part and have not changed: raw_user_meta_data is provider-supplied here and
-- client-supplied on an email signup, so reading `role` or `estat` out of it
-- would be instant total compromise either way.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre, avatar_url, estat, role)
  values (
    new.id,
    -- Google sends full_name and name. Falling all the way through to the
    -- local part of the address, and then to a constant, because nombre is
    -- NOT NULL and a violation here surfaces as Supabase's opaque "Database
    -- error saving new user" and blocks signup outright.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Membre'
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    'pendent', -- HARDCODED. Never from metadata.
    'member'   -- HARDCODED. Never from metadata.
  )
  on conflict (id) do nothing;

  insert into public.profile_secret (id) values (new.id) on conflict (id) do nothing;

  insert into public.profile_contact (id, correu)
  values (new.id, new.email)
  on conflict (id) do nothing;

  return new;
end $$;

-- Only INSERT fires this, so a name or avatar changed on the Google account
-- later does not follow. That is deliberate for now: members can edit their
-- own name, and silently overwriting it on every sign-in would undo that.

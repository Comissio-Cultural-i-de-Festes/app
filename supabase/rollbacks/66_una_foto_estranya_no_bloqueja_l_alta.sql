-- Rollback de la migració 66. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna el disparador d'alta a escriure la foto del proveïdor tal com arriba,
-- o sigui que una `picture` allotjada en un amfitrió que el CHECK de la 59 no
-- reconeix torna a fer petar l'alta sencera amb «Database error saving new
-- user». Si s'arriba a fer servir això, desfés també la 59.

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
    'pendent',
    'member'
  )
  on conflict (id) do nothing;

  insert into public.profile_secret (id) values (new.id) on conflict (id) do nothing;

  insert into public.profile_contact (id, correu)
  values (new.id, new.email)
  on conflict (id) do nothing;

  return new;
end $$;

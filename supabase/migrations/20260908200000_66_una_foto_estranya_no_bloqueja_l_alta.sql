-- Una foto de perfil estranya no ha de bloquejar l'alta.
--
-- EL QUE VAIG DEIXAR MAL FET A LA 59. Aquella migració va posar un CHECK a
-- `profiles.avatar_url` per a tancar la balisa de rastreig: o és un camí del
-- cubell, o és una URL de `lh<xifra>.googleusercontent.com`, o és NULL. Ben
-- pensat per a l'UPDATE que fa el client, que era el forat.
--
-- Però el disparador d'alta escriu aquella mateixa columna SENSE FILTRAR:
--
--   coalesce(nullif(raw_user_meta_data ->> 'avatar_url',''),
--            nullif(raw_user_meta_data ->> 'picture',''))
--
-- O sigui que si Google torna una `picture` allotjada en qualsevol altre
-- amfitrió, el CHECK aixeca un 23514 DINS del disparador, es desfà l'INSERT a
-- `auth.users` sencer, i GoTrue respon «Database error saving new user».
-- Aquella persona no es pot donar d'alta i res no diu per què.
--
-- I EL PITJOR ÉS QUE JA HO SABÍEM. Tres línies més amunt, al mateix fitxer de
-- la migració 09, hi ha el mateix perill explicat per al camp del costat:
--
--   «a violation here surfaces as Supabase's opaque "Database error saving new
--    user" and blocks signup outright»
--
-- Per això `nombre` té un coalesce de cinc nivells que acaba en la constant
-- 'Membre'. `avatar_url` no en tenia cap, i la 59 li va posar una tanca a
-- sobre sense mirar qui més hi escrivia.
--
-- La comprovació que vaig fer abans d'aplicar la 59 —«contra les files reals
-- de producció, zero files rebutjades»— mirava les files QUE JA HI HAVIA, no
-- el camí d'escriptura. I la prova 380 només fa UPDATE com a soci existent.
-- Cap de les dues podia veure això.
--
-- L'ARREGLO NO ÉS RELAXAR EL CHECK sinó sanejar a l'origen, com ja es fa amb
-- el nom: si la foto que arriba no és d'un amfitrió que sabem servir, s'entra
-- sense foto. Perdre l'avatar és una molèstia; no poder entrar és una porta
-- tancada.
--
-- I DE PASSADA TANCA LA MEITAT QUE FALTAVA DE LA 59. `raw_user_meta_data` és
-- del client a la via d'entrada per correu —el disparador ja ho diu, i per
-- això `estat` i `role` hi van escrits a mà—, o sigui que fins ara s'hi podia
-- colar una URL arbitrària en el moment de l'alta. La 59 tapava l'UPDATE i
-- deixava l'INSERT obert.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto text;
begin
  -- La foto que arriba del proveïdor, i NULL si no la sabem servir. El patró
  -- és el mateix que el `profiles_avatar_url_check` de la 59; escrit dues
  -- vegades a posta, perquè si algun dia se n'afegeix un amfitrió cal tocar
  -- els dos llocs i és millor que peti una prova que no pas que una alta
  -- torni a fallar en silenci. La prova 430 ho vigila.
  v_foto := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );
  if v_foto is not null and v_foto !~ '^https://lh[0-9]+\.googleusercontent\.com/' then
    v_foto := null;
  end if;

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
    v_foto,
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

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- A supabase/rollbacks/66_una_foto_estranya_no_bloqueja_l_alta.sql, que torna
-- el disparador a escriure la foto tal com arriba. Desfer-ho torna a deixar
-- que una `picture` d'un amfitrió desconegut bloquegi una alta sencera, i
-- només val la pena si el sanejament trenca una altra cosa. Millor seria
-- desfer també la 59.

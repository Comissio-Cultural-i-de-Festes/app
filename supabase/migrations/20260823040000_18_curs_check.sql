-- The year of a degree, tightened from six to five.
--
-- The original CHECK allowed 1 to 6 as a guess. It is five: the TecnoCampus
-- runs fifteen single degrees at 240 ECTS over four years, and every double
-- and simultaneous degree — Informàtica amb Videojocs, ADE amb Turisme, CAFE
-- amb Fisioteràpia and the rest — is five. Nothing there is longer.
--
-- It matters beyond tidiness: the locale files label years 1 to 5, so a 6 in
-- this column renders the literal string "onboarding.year.6" on that person's
-- profile, on their QR card at the door and in the junta's check-in list. A
-- constraint wider than the labels is a constraint that produces a bug.

-- Nothing can be at 6 today — the onboarding screen has only ever offered
-- four buttons — but a migration that can fail on `db push` is worse than one
-- that cannot. Cleared to null rather than clamped to 5, because "we no
-- longer have a value for this" is true and "you are in your fifth year" would
-- not be.
update public.profiles set curs = null where curs > 5;

alter table public.profiles drop constraint profiles_curs_check;
alter table public.profiles add constraint profiles_curs_check check (curs between 1 and 5);

comment on column public.profiles.curs is
  'Year of the degree, 1 to 5. Five because the double and simultaneous '
  'degrees run five years and nothing at this campus runs longer. Keep this '
  'in step with onboarding.year.* in the locale files: a value with no label '
  'renders as its own key.';

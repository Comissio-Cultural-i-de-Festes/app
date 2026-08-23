-- The degrees, so nobody has to type theirs.
--
-- `profiles.grau` was a free text box, which produces "Informàtica", "Eng.
-- Informàtica", "informatica de gestio" and "GEIGSI" for one degree, all of
-- them shown next to somebody's name on their QR card at the door.
--
-- The list lives here rather than in the app for the same reason the points
-- scale does: it is specific to one university, it changes without warning —
-- Intel·ligència Artificial i Robòtica Aplicades did not exist three years
-- ago — and neither of those should need a deploy. The junta edits it.
--
-- `profiles.grau` stays TEXT and keeps holding the name rather than a foreign
-- key. Three reasons: the rows already written stay valid, renaming a degree
-- does not orphan the people on it, and the field has to keep accepting
-- something typed by hand for the exchange student and the person on a
-- programme nobody has added yet. The value is shown and never grouped by —
-- `escola` is the one that is constrained, because that is the one the ranking
-- is computed over.

create table public.graus (
  id     uuid primary key default gen_random_uuid(),
  escola text not null check (escola in ('politecnica', 'empresa', 'salut')),
  nom    text not null check (length(nom) between 2 and 120),
  ordre  int  not null default 0,
  unique (escola, nom)
);

comment on table public.graus is
  'The degrees on offer, per school, for the picker on the first-run screen. '
  'Editable by the junta without a deploy. profiles.grau stores the NAME and '
  'not a reference to this table, so a rename here never orphans anybody and '
  'a degree that is not on the list can still be typed.';

create index graus_escola_idx on public.graus (escola, ordre, nom);

alter table public.graus enable row level security;

-- Anybody who is on their way in has to be able to read it: this is the
-- screen where a pending profile picks a school, before they are active.
create policy graus_select_member on public.graus
  for select to authenticated
  using ((select private.is_member_or_pending()));

create policy graus_write_admin on public.graus
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Privileges are checked before policies, so revoking the write grants would
-- make the admin policy above unreachable. Same reasoning as point_values.
revoke all on public.graus from anon, authenticated;
grant select, insert, update, delete on public.graus to authenticated;
grant select, insert, update, delete on public.graus to service_role;

-- ── the list, as the university publishes it ────────────────────────────────
-- Escola Superior Politècnica, Escola Superior de Ciències Socials i de
-- l'Empresa, Escola Superior de Ciències de la Salut. The doubles and the
-- simultaneities are on the list because they are what somebody would answer,
-- and because they are the five-year ones.
insert into public.graus (escola, nom, ordre) values
  ('politecnica', 'Enginyeria Electrònica Industrial i Automàtica', 1),
  ('politecnica', 'Enginyeria Mecànica', 2),
  ('politecnica', 'Enginyeria en Organització Industrial', 3),
  ('politecnica', 'Enginyeria Informàtica de Gestió i Sistemes d''Informació', 4),
  ('politecnica', 'Intel·ligència Artificial i Robòtica Aplicades', 5),
  ('politecnica', 'Mitjans Audiovisuals', 6),
  ('politecnica', 'Disseny i Producció de Videojocs', 7),
  ('politecnica', 'Enginyeria Informàtica i Videojocs (doble)', 8),
  ('politecnica', 'Electrònica i Mecànica (simultani)', 9),
  ('politecnica', 'Electrònica i Informàtica (simultani)', 10),
  ('politecnica', 'Audiovisuals i Videojocs (simultani)', 11),

  ('empresa', 'Administració d''Empreses i Gestió de la Innovació', 1),
  ('empresa', 'Màrqueting i Comunitats Digitals', 2),
  ('empresa', 'Turisme i Gestió del Lleure', 3),
  ('empresa', 'Logística i Negocis Marítims', 4),
  ('empresa', 'Turisme i Administració d''Empreses (doble)', 5),
  ('empresa', 'Administració d''Empreses i Màrqueting (doble)', 6),

  ('salut', 'Infermeria', 1),
  ('salut', 'Fisioteràpia', 2),
  ('salut', 'Ciències de l''Activitat Física i de l''Esport', 3),
  ('salut', 'Nutrició Humana i Dietètica', 4),
  ('salut', 'Fisioteràpia i CAFE (doble)', 5)
on conflict (escola, nom) do nothing;

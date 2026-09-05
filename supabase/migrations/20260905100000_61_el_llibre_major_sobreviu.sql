-- El llibre major i la galeria sobreviuen a qui els va escriure.
--
-- EL QUE PASSAVA. `profiles.id` referencia `auth.users(id)` amb ON DELETE
-- CASCADE, i el tancament transitiu d'aquella cascada són dinou taules. Entre
-- elles, dues que no haurien de ser-hi:
--
--   `points_log`, que el seu propi comentari declara APPEND-ONLY i diu que
--   «the history survives». Té disparador contra UPDATE i cap contra DELETE,
--   així que la cascada se l'enduia en silenci: esborrar un compte de Google
--   esborrava els punts que aquella persona va guanyar, i amb ells la meitat
--   de les sumes del rànquing d'un curs.
--
--   `event_photos`, que se n'anava deixant els BYTES orfes al bucket. La fila
--   desapareix, el fitxer es queda, i ja no hi ha res que el pugui trobar per
--   esborrar-lo: `private.event_photo_owner` llegeix el camí, però ningú no
--   torna a mirar aquell camí mai més.
--
-- LA DECISIÓ, i té una conseqüència que val la pena dir clara: amb RESTRICT,
-- una persona amb punts o amb fotos JA NO ES POT ESBORRAR. Ni des de l'app
-- —que no ho fa mai— ni esborrant el compte de Google, que ara fallarà.
--
-- Això és el que es vol. Donar-se de baixa d'una associació no és desaparèixer
-- del que va passar: els punts que algú va guanyar en una festa són part del
-- resultat d'aquella festa i del curs de tothom, i les fotos d'una nit són de
-- la nit. El camí per marxar és `estat = 'baixa'`, que ja existeix, deixa de
-- comptar per al rànquing i no toca res del que ja va passar.
--
-- SI ALGUN DIA CAL ESBORRAR DE VERITAT una persona —una petició de supressió,
-- posem— el camí és explícit i és el correcte: reassignar o esborrar primer
-- les seves files de `points_log` i `event_photos` amb `service_role`, i
-- aleshores el compte. Que costi una decisió conscient és el punt.
--
-- LES ALTRES DUES QUE APUNTEN A `profiles` DES D'AQUESTES TAULES NO CANVIEN:
-- `points_log.granted_by` i `event_photos.hidden_by` ja són SET NULL, i està
-- bé: qui va donar els punts o qui va amagar la foto és metadada de l'acció,
-- no l'acció. Que la junta canviï no ha d'impedir que ningú marxi.

alter table public.points_log
  drop constraint points_log_user_id_fkey,
  add constraint points_log_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.event_photos
  drop constraint event_photos_user_id_fkey,
  add constraint event_photos_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete restrict;

comment on table public.points_log is
  'El llibre major de punts. Append-only: cap grant d''UPDATE ni de DELETE per '
  'a authenticated, disparador contra UPDATE, i des de la migracio 61 la clau '
  'forana cap a profiles es RESTRICT, o sigui que esborrar una persona amb '
  'punts falla en lloc d''endur-se''ls. Per a marxar hi ha estat = baixa.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- alter table public.points_log
--   drop constraint points_log_user_id_fkey,
--   add constraint points_log_user_id_fkey
--     foreign key (user_id) references public.profiles(id) on delete cascade;
--
-- alter table public.event_photos
--   drop constraint event_photos_user_id_fkey,
--   add constraint event_photos_user_id_fkey
--     foreign key (user_id) references public.profiles(id) on delete cascade;
--
-- Desfer-ho torna a deixar que esborrar un compte s'endugui el llibre major.

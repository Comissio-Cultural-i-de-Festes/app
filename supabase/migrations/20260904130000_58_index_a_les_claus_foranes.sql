-- Índex a les onze claus foranes que no en tenien.
--
-- QUÈ ES GUANYA, I SOBRETOT QUÈ NO. Aquests onze índexs NO són per a cap
-- consulta de cap pantalla. Cap consulta del client filtra per
-- `event_photos.hidden_by` ni per `ride_seats.convidat_per`. Són per al camí de
-- BORRAT, que és una cosa diferent i que fins ara ningú havia mirat:
--
--   Quan s'esborra una fila referenciada, Postgres ha de trobar les que hi
--   apunten per aplicar-hi l'acció. Sense índex, això és un recorregut sencer
--   de la taula que referencia, per cada fila esborrada. Les quatre en CASCADE
--   (`event_interest.user_id`, `gimcana_enviaments.equip_id`,
--   `gimcana_membres.user_id`, `photo_reports.user_id`) i les set en SET NULL
--   fan servir el mateix mecanisme.
--
-- I EL CAMÍ EXISTEIX DE DEBÒ: `profiles.id` referencia `auth.users(id)` amb ON
-- DELETE CASCADE, i el tancament transitiu d'això són dinou taules. Esborrar un
-- compte de Google recorre totes onze d'aquestes claus.
--
-- PER QUÈ AIXÒ NO CONTRADIU ELS DEU ÍNDEXS QUE SOBREN. El linter de Supabase
-- també diu que hi ha deu índexs creats i mai fets servir
-- (`event_photos_event_idx`, els cinc de gimcana, `push_subscription_user_idx`…)
-- i aquells són una altra cosa: índexs de consulta posats per si de cas, que no
-- serveixen cap `where` real. Aquests onze no són per a un `where`: són
-- manteniment d'integritat referencial, i el planificador no els «fa servir»
-- mai en el sentit que el linter compta. Treure els deu i posar aquests onze
-- no és contradictori; és mirar dues coses diferents.
--
-- HONESTAMENT, EL GUANY MESURAT AVUI ÉS ZERO. Les onze taules tenen zero files
-- al local i producció en té menys de quaranta a la més plena. Un recorregut
-- sencer de dues-centes files és gratis. Això es fa ara perquè és el moment en
-- què la base està buida —crear-los amb dades és el que demana `CONCURRENTLY`,
-- i amb la taula buida no cal— i perquè deixa el linter net, que és el que fa
-- que el pròxim avís de veritat es vegi.

create index if not exists event_interest_user_idx
  on public.event_interest (user_id);

create index if not exists event_photos_hidden_by_idx
  on public.event_photos (hidden_by);

create index if not exists gimcana_enviaments_equip_idx
  on public.gimcana_enviaments (equip_id);

create index if not exists gimcana_enviaments_validat_per_idx
  on public.gimcana_enviaments (validat_per);

create index if not exists gimcana_membres_user_idx
  on public.gimcana_membres (user_id);

create index if not exists gimcanes_created_by_idx
  on public.gimcanes (created_by);

create index if not exists photo_reports_resolt_per_idx
  on public.photo_reports (resolt_per);

create index if not exists photo_reports_user_idx
  on public.photo_reports (user_id);

create index if not exists proposals_decided_by_idx
  on public.proposals (decided_by);

create index if not exists ride_seats_convidat_per_idx
  on public.ride_seats (convidat_per);

create index if not exists event_geo_updated_by_idx
  on private.event_geo (updated_by);

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- drop index if exists public.event_interest_user_idx;
-- drop index if exists public.event_photos_hidden_by_idx;
-- drop index if exists public.gimcana_enviaments_equip_idx;
-- drop index if exists public.gimcana_enviaments_validat_per_idx;
-- drop index if exists public.gimcana_membres_user_idx;
-- drop index if exists public.gimcanes_created_by_idx;
-- drop index if exists public.photo_reports_resolt_per_idx;
-- drop index if exists public.photo_reports_user_idx;
-- drop index if exists public.proposals_decided_by_idx;
-- drop index if exists public.ride_seats_convidat_per_idx;
-- drop index if exists private.event_geo_updated_by_idx;
--
-- A producció, amb dades, els `drop` volen `CONCURRENTLY` i per tant no poden
-- anar dins d'una transacció.

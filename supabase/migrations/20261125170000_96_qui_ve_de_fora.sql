-- Qui ve de fora ho pot dir, en comptes d'inventar-se una escola.
--
-- A la casa rural, i a qualsevol activitat oberta, hi ve gent que no és de cap
-- de les tres escoles. El primer cop que entren, el client els obligava a
-- triar-ne una —`needsOnboarding` era `escola === null`, i la porta de
-- `RequireOnboarding` no deixava passar sense—, així que en triaven una
-- qualsevol. Aquella escola inventada sumava al rànquing d'escoles, al tauler
-- de la junta i a les llistes de qui ve, i ningú no la podia distingir d'una de
-- veritat.
--
-- LA BASE DE DADES JA ACCEPTAVA UN SOCI SENSE ESCOLA. `escola` admet null des
-- de l'01, i tot el que la llegeix ja sabia què fer-ne: el rànquing d'escoles i
-- el tauler en deixen fora els nulls (`p.escola is not null`), el rànquing
-- individual els inclou, i la gimcana per escoles els posa a l'equip més petit.
-- El que faltava era poder dir «he acabat el primer cop i no tinc escola», que
-- amb una sola columna no es podia distingir de «encara no he contestat».
--
-- REBUTJADA: UNA QUARTA ESCOLA `'extern'` dins del mateix `check`. Hauria
-- estalviat la columna, però a partir de tres externs actius `ranking_escoles`
-- (`membres >= 3`) la comptaria com una escola més i competiria a la taula, el
-- tauler li faria una fila, i les deu pantalles que pinten
-- `t('escolaShort.' + escola)` mostrarien una clau sense traduir. Cada `where
-- p.escola is not null` de la base hauria de passar a excloure-la a mà, i el
-- primer que se n'oblidés tornaria a inflar una escola.
--
-- EL `check` ÉS QUI GARANTEIX QUE UN EXTERN NO COMPTA PER A CAP ESCOLA. Un
-- extern amb escola seria una fila que diu dues coses que no poden ser
-- alhora, i la que guanyaria seria l'escola, perquè és la que llegeixen les
-- vistes. Així, marcar algú com a extern obliga a buidar-li l'escola a la
-- mateixa sentència, i ho fan tant el primer cop com la fitxa de la junta.
--
-- QUI EL POT ESCRIURE. El grant de columna se suma al de la 03 i a la 70. Les
-- polítiques que ja hi ha decideixen les files: `profiles_update_self` per a la
-- pròpia —el primer cop— i `profiles_update_admin` per a la de qualsevol —la
-- junta corregint qui ja s'havia inventat una escola—. `private.profiles_guard()`
-- no s'ha de tocar: enumera els camps prohibits i aquest no n'és cap. Que un
-- soci es marqui extern ell sol per l'API no obre res de nou: ja podia buidar
-- la seva escola amb el grant de la 03, i el `check` no el deixa ser les dues
-- coses.
--
-- ES LLEGEIX AMB EL GRANT DE TAULA SENCERA de la 03, com l'escola. No és cap
-- dada sensible: és el mateix que dir de quina escola ets.

alter table public.profiles
  add column extern boolean not null default false,
  add constraint profiles_extern_sense_escola
    check (not extern or escola is null);

comment on column public.profiles.extern is
  'Ve de fora de les escoles: ha acabat el primer cop sense triar-ne cap. '
  'Sempre amb escola a null (profiles_extern_sense_escola), o sigui que no '
  'compta per a cap escola al rànquing ni al tauler, però sí al rànquing '
  'individual. El primer cop es demana mentre escola sigui null i això sigui '
  'fals. Ho escriu el mateix soci al primer cop o la junta des de la fitxa.';

grant update (extern) on public.profiles to authenticated;

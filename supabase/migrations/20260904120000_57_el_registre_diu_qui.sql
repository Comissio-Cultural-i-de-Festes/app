-- El registre torna a dir QUI ha fet cada cosa.
--
-- EL QUE PASSAVA. `audit_log.accio` és l'única columna amb forma
-- d'enumeració de les trenta taules que no tenia `CHECK` ni catàleg. La base
-- escriu vint-i-un valors i només setze tenien etiqueta a l'i18n. Els altres
-- cinc queien al repliegue d'`AuditScreen.tsx:136-138`:
--
--   defaultValue: t('junta.audit.other', { actor, accio: row.accio })
--
-- i la cadena `junta.audit.other` és «Ha passat una cosa: {{accio}}», que
-- **no interpola `{{actor}}`** tot i que se li passa. Les setze etiquetes
-- normals sí: `set_role` és «{{actor}} ha canviat el rol d'algú».
--
-- O sigui que per a cinc accions el registre perdia el nom de qui les feia.
-- I no són cinc qualssevol:
--
--   transfer_owner    traspassar la propietat de l'associació
--   close_meeting     tancar una reunió, que reparteix punts
--   decide_proposal   acceptar o rebutjar la idea d'un soci
--   check_in_here     fitxar algú per ubicació
--   reveal_push       l'avís de la revelació
--
-- La pantalla del registre promet «tot el que facis aquí queda al registre amb
-- el teu nom», i és l'única defensa contra l'abús d'un admin —n'hi ha cinc i un
-- owner—. Traspassar la propietat es llegia «Ha passat una cosa:
-- transfer_owner», sense dir qui.
--
-- LA MIGRACIÓ 52 JA HO VA AVISAR per a `reveal_push` i es va quedar en l'avís.
--
-- PER QUÈ UN CHECK I NO NOMÉS LES ETIQUETES. Les etiquetes soles tornarien a
-- quedar-se enrere la propera vegada, perquè res no lliga les dues llistes:
-- la clau es construeix des del dada (`accio.${row.accio}`), així que un valor
-- nou no falla ni a l'i18n ni al typecheck ni a cap test. Amb el `CHECK`, el
-- conjunt de valors passa a ser explícit i `tests/audit-actions.test.ts` pot
-- creuar-lo amb els tres locales: afegir una acció nova obliga a tocar aquesta
-- llista, i tocar-la fa fallar el test fins que hi ha etiqueta en català,
-- castellà i anglès.
--
-- COMPROVAT ABANS D'APLICAR-HO: les 38 files de producció fan servir deu
-- d'aquests valors i cap de fora de la llista, així que el `CHECK` no rebutja
-- res del que ja hi ha.
--
-- L'ALTERNATIVA que es descarta és una taula catàleg amb clau forana, que és
-- més neta de veres però demana una taula més, el seu grant, la seva política i
-- una migració cada vegada que s'afegeix una acció. Per a una llista de
-- vint-i-un valors que canvia dues vegades per curs, el `CHECK` diu el mateix.

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'award_points',
    'check_in_here',
    'close_meeting',
    'create_event',
    'create_invite',
    'decide_attendance',
    'decide_proposal',
    'delete_event',
    'delete_grau',
    'edit_event',
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
    'set_estat',
    'set_paid',
    'set_point_value',
    'set_published',
    'set_role',
    'transfer_owner',
    'undo_checkin'
  ));

comment on column public.audit_log.accio is
  'Quina cosa s''ha fet. La llista viu al CHECK d''aquesta columna i '
  '`tests/audit-actions.test.ts` exigeix que cada valor tingui etiqueta als '
  'tres locales: la clau de traduccio es construeix des d''aqui '
  '(`junta.audit.accio.<accio>`) i per tant un valor sense etiqueta no falla '
  'enlloc mes.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- alter table public.audit_log drop constraint audit_log_accio_check;
--
-- Desfer-ho torna a deixar la columna com un text lliure. Les etiquetes de
-- l'i18n i el test viuen al mateix commit, així que per desfer-ho tot cal
-- revertir el commit, no només aquesta restricció.

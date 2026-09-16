-- Conduir sol no és haver portat ningú: un sol motiu, i val 20.
--
-- EL QUE HI HAVIA. Des de la migració 15 hi ha dos motius per premiar el
-- mateix vespre, `conduir` (25) i `trajo_gente` (15), i són dos botons
-- independents a la pantalla de donar punts. O sigui que la mateixa nit es pot
-- pagar 25 a qui hi ha anat sol amb cotxe —que és el que hauria fet igualment,
-- i no és cap servei al grup— i 40 a qui ha portat gent, si la junta prem els
-- dos botons. Cap dels dos números és el que ningú volia, i quin surt depèn de
-- qui hi hagi a la porta aquell dia.
--
-- El que val la pena premiar és que hi hagi hagut gent que ha pogut venir
-- gràcies a tu, i això, a la pràctica, sempre vol dir el mateix: has agafat el
-- cotxe i has portat algú. Un sol motiu, doncs, i 20 punts, entremig dels 15 i
-- els 25 d'ara.
--
-- QUINA CLAU ES QUEDA. `trajo_gente`, que és la que ja diu el que es premia.
-- L'opció contrària —quedar-se `conduir`, apujar-la, i reescriure les files
-- velles de `trajo_gente` a la clau nova perquè l'històric no quedés partit en
-- dos— hauria volgut dir tocar el llibre de punts per canviar una etiqueta, i
-- això és exactament el que aquí no es fa: la migració 61 existeix perquè el
-- llibre major sobrevisqui a tota la resta.
--
-- EL `CHECK` DE `points_log.motivo` NO ES TOCA, i és la meitat important. Si es
-- retallés, aquesta migració hauria de validar les files que ja hi ha i petaria
-- el dia que n'hi hagués una de `conduir`. Les tres llistes diuen coses
-- diferents, i aquí es veu per què no es mouen juntes:
--
--   CHECK de points_log      què pot EXISTIR       història; no es retalla mai
--   allowlist d'award_points què es pot CREAR ara
--   files de point_values    quins botons es DIBUIXEN
--
-- L'ALLOWLIST TAMPOC ES TOCA AQUÍ, I ÉS UNA DECISIÓ. `conduir` hi continua
-- sent, o sigui que un admin que es fabriqui la crida a mà encara el pot donar.
-- Es queda per a una migració a part perquè treure'l demana reescriure
-- `award_points` sencera —Postgres no sap editar-ne el cos— i la funció l'ha
-- canviada fa poc una altra feina, la de la nota obligatòria als ajustos a mà.
-- Un `create or replace` escrit sobre el cos de la 15 li passaria l'aigua per
-- sobre sense dir-ho: la nota deixaria de ser obligatòria i ningú ho sabria
-- fins que algú mirés el registre al març. Val més una fila de menys avui que
-- una regla desfeta en silenci.
--
-- Mentrestant el forat és petit i està tancat per dalt: `conduir` no és cap
-- botó, no és cap fila de l'escala, i la pantalla de la junta no el pot tornar
-- a dibuixar —`admin_set_point_value` no inventa files—. El que queda obert és
-- una crida a mà que avui no fa ningú.
--
-- ELS 20 SÓN EL VALOR INICIAL, no una constant: `point_values` és una taula que
-- la junta edita amb `admin_set_point_value`, i si al gener es veu que no s'hi
-- ajusta es canvia sense desplegar res. L'`update` d'aquí sota és incondicional
-- tot i que a producció la junta ja ha tocat `montaje` i `propuso` —o sigui que
-- podria haver tocat aquesta— perquè el motiu fusionat és una cosa nova i els
-- 15 eren el preu de l'altra.
--
-- EL QUE AQUESTA MIGRACIÓ TAMPOC FA, i també és una decisió. Qui porta gent a
-- l'anada i una altra colla a la tornada pot cobrar dos cops: el botó es pot
-- prémer dues vegades, igual que fins ara. Una tanca —un únic `trajo_gente` per
-- persona i acte— també tancaria la porta a corregir a mà una nit mal apuntada,
-- i qui és a la porta ja ho decideix cada vespre.

-- ── la fila que marxa i la que es queda ─────────────────────────────────────
-- L'ordre es torna a numerar seguit perquè és l'únic que llegeix la pantalla de
-- l'escala: un buit al mig no trenca res, però surt a la taula que la junta
-- edita i sembla una fila que s'ha perdut.
delete from public.point_values
 where mena = 'motiu' and clau = 'conduir';

update public.point_values
   set punts = 20, ordre = 2
 where mena = 'motiu' and clau = 'trajo_gente';

update public.point_values
   set ordre = 3
 where mena = 'motiu' and clau = 'propuso';

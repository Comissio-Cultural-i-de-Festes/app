-- Rollback de la migració 84. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu els tres pesos i els tres escalons i torna el llindar únic de la 73, amb
-- el valor de sortida (4). Si la junta l'havia mogut abans de la 84, aquell
-- número ja no hi és: la 84 el va esborrar, i aquí es torna al de fàbrica.
--
-- ORDRE: AQUEST VA DESPRÉS DELS DE LA 85 A LA 88, si s'han aplicat. Cap
-- d'aquelles no llegeix aquestes files a la base —els pesos i els escalons els
-- compta el client—, però el client que s'hi desplegui sí: amb aquest fitxer
-- aplicat i el client nou, els sis escalons llegiran 0, que vol dir apagats, i
-- ningú no sortirà marcat. És el que ha de passar quan falta la fila, i no una
-- marca inventada.
--
-- QUÈ TORNA A OBRIR: la marca «Per mirar» amb la suma de gravetats, que el
-- client nou ja no sap llegir. Aquest fitxer només té sentit amb el client
-- d'abans de la 84.

delete from public.point_values
 where mena = 'avisos'
   and clau in (
     'pes_lleu', 'pes_greu', 'pes_molt_greu',
     'llindar_avis', 'llindar_risc', 'llindar_expulsio'
   );

insert into public.point_values (mena, clau, punts, ordre) values
  ('avisos', 'llindar', 4, 1)
on conflict (mena, clau) do nothing;

update public.point_values set ordre = 2 where mena = 'avisos' and clau = 'sostre_curs';

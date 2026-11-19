-- Rollback de la migració 94. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu el resum. No perd res: la funció no desa cap dada, i les assistències
-- continuen a `attendances` amb les mateixes polítiques.
--
-- ABANS, EL CLIENT. L'Inici i la fitxa d'un client que ja la crida es quedarien
-- sense recomptes ni cares —l'Inici diria «no se sap» al lloc del botó— fins
-- que tornés a llegir les files. Es desfà després d'haver desplegat el client
-- d'abans, no abans.

drop function if exists public.resum_assistencies(uuid[], timestamptz);

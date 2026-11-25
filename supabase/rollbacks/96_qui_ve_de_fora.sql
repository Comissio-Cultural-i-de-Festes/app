-- Rollback de la migració 96. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu la columna `extern`, i amb ella el `check` i el `grant update (extern)`,
-- que en pengen i cauen sols amb el `drop column`.
--
-- QUI ERA EXTERN ES QUEDA SENSE ESCOLA I TORNA AL PRIMER COP. És el que vol
-- dir desfer-ho: sense la columna, un soci amb escola a null és algú que encara
-- no ha contestat, i el client el portarà a `/primer-cop` a triar-ne una. No
-- es perd res que no es pugui tornar a dir.
--
-- ORDRE respecte del desplegament. Primer el client ha de deixar de demanar la
-- columna —el `select` de `src/features/session/profile.ts` l'enumera per nom i
-- amb la versió nova desplegada un `drop column` torna un 42703 a cada càrrega
-- de perfil— i després això.

alter table public.profiles drop column if exists extern;

-- Rollback de la migració 88. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu l'enganxada automàtica: els tres disparadors i les seves funcions. Els
-- avisos pendents continuen existint i la junta els pot continuar enllaçant a mà
-- amb la RPC de la 87; el que deixa de passar és que trobin sols el seu soci.
--
-- NO PERD RES. Els avisos que ja es van enganxar es queden —són avisos normals—
-- i els pendents que esperen continuen esperant. Els que tenien un `motiu`
-- escrit per l'enganxada el conserven: diu què va passar l'últim cop que es va
-- provar.
--
-- ORDRE: aquest va abans que el de la 87, que esborra la taula on pengen dos
-- d'aquests disparadors.

drop trigger if exists avisos_pendents_enganxa_en_neixer on public.avisos_pendents;
drop trigger if exists profiles_enganxa_pendents on public.profiles;
drop trigger if exists profile_contact_enganxa_pendents on public.profile_contact;

drop function if exists private.enganxa_el_pendent_nou();
drop function if exists private.enganxa_per_l_estat();
drop function if exists private.enganxa_pel_telefon();
drop function if exists private.enganxa_per_digits(text);

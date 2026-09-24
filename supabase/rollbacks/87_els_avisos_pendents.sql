-- Rollback de la migració 87. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu els avisos pendents sencers: la taula, les tres RPC de la junta, el nucli
-- que els converteix en avís, la purga i el seu job.
--
-- AQUEST FITXER PERD INFORMACIÓ, i es diu aquí. Els pendents que esperen se'n
-- van amb la taula —noms i telèfons de gent que no és sòcia, que és el que
-- menys greu és perdre— i també la relació dels que ja es van enllaçar amb el
-- seu avís. Els AVISOS que en van sortir es queden: són avisos normals, amb la
-- seva fila a `avisos` i la seva fila de punts, i desfer una taula no ha de
-- desfer el que va passar. Les files del registre de les tres accions noves
-- s'esborren perquè el CHECK de la 86 no les admet.
--
-- ORDRE: aquest va DESPRÉS del de la 88, que penja disparadors d'aquesta taula,
-- i ABANS que el de la 86, que canvia la firma del nucli que
-- `private.enganxa_pendent` crida.

do $$
begin
  perform cron.unschedule('purga-avis-pendents');
exception when others then
  -- Sense el job no hi ha res a desprogramar: el fitxer ha de poder passar
  -- igualment.
  null;
end $$;

drop function if exists private.purga_avis_pendents();
drop function if exists public.enllaca_avis_pendent(uuid, uuid);
drop function if exists public.retira_avis_pendent(uuid, text);
drop function if exists public.crea_avis_pendent(text, text, timestamptz, text, text, int, int, text);
drop function if exists private.enganxa_pendent(uuid, uuid, text, uuid);

drop table if exists public.avisos_pendents;

drop function if exists private.darrers_9(text);

delete from public.audit_log
 where accio in ('avis_pendent', 'enllaca_avis_pendent', 'retira_avis_pendent');

alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'avis',
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
    'edita_mesura_presa',
    'hores_persona',
    'retira_avis',
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
    'set_avis_tipus',
    'set_estat',
    'set_hores',
    'set_paid',
    'set_point_value',
    'set_published',
    'set_role',
    'transfer_owner',
    'undo_checkin',
    'visa_hores'
  ));

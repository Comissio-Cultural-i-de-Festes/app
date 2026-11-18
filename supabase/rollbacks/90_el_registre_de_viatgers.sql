-- Rollback de la migració 90. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Treu el registre de viatgers sencer: la taula, la casella d'`events`, les
-- tres RPC de la junta, els disparadors que esborren, la purga i el seu job.
--
-- AQUEST FITXER ESBORRA DADES, i és el que toca. Les dades de viatger que hi
-- hagi se'n van amb la taula: són dades que ja havien de desaparèixer soles, i
-- no hi ha cap lloc on guardar-les que no fos pitjor. Les files del registre de
-- les dues accions noves s'esborren perquè el CHECK de la 87 no les admet; no
-- porten cap dada del registre de viatgers, només qui les va obrir i quan.
--
-- ORDRE: aquest va abans que el de la 88.

do $$
begin
  perform cron.unschedule('purga-dades-viatger');
exception when others then
  -- Sense el job no hi ha res a desprogramar: el fitxer ha de poder passar
  -- igualment.
  null;
end $$;

drop function if exists private.purga_dades_viatger();
drop function if exists public.admin_dades_viatgers(uuid, boolean);
drop function if exists public.admin_viatgers(uuid);
drop function if exists public.admin_set_demana_viatger(uuid, boolean);

drop trigger if exists events_dades_viatger_casella on public.events;
drop trigger if exists profiles_dades_viatger_baixa on public.profiles;
drop trigger if exists attendances_dades_viatger_fora on public.attendances;
drop trigger if exists attendances_dades_viatger_estat on public.attendances;

drop function if exists private.dades_viatger_sense_casella();
drop function if exists private.dades_viatger_en_la_baixa();
drop function if exists private.dades_viatger_en_desapuntar();

drop table if exists public.dades_viatger;

drop function if exists private.dades_viatger_tocades();
drop function if exists private.pot_desar_viatger(uuid);
drop function if exists private.viatger_caduca(uuid);
drop function if exists private.document_viatger_valid(text, text, text);
drop function if exists private.camp_viatger_net(text, int);
drop function if exists private.esta_apuntat(text);

alter table public.events drop column if exists demana_viatger;

delete from public.audit_log where accio in ('consulta_viatgers', 'set_demana_viatger');

alter table public.audit_log drop constraint audit_log_accio_check;

alter table public.audit_log
  add constraint audit_log_accio_check check (accio in (
    'avis',
    'avis_pendent',
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
    'enllaca_avis_pendent',
    'hores_persona',
    'retira_avis',
    'retira_avis_pendent',
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

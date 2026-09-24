-- Rollback de la migració 73. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- QUÈ DESFÀ, I EN QUIN ORDRE. Primer les dues taules i les tres RPC, que és el
-- que fa que els motius nous del llibre major quedin sense ningú que els
-- escrigui; i al final les allowlists, que no es poden estrènyer mentre hi
-- hagi files que les violin.
--
-- I PER AIXÒ ESBORRA LES FILES DE `points_log` DELS DOS MOTIUS NOUS. És l'única
-- part d'aquest fitxer que perd informació, i es fa perquè no hi ha alternativa:
-- la constraint no es pot tornar a estrènyer amb files de motiu `avis` a dins.
-- Si això s'ha d'executar amb avisos ja posats, el que s'ha de fer abans és
-- guardar-se'ls; aquí es diu i no s'amaga.
--
-- ORDRE: AQUEST ÉS L'ÚLTIM DELS AVISOS. Les migracions que han vingut després
-- hi construeixen a sobre —el sostre, la nota, els escalons, la gravetat triada
-- i el que vingui— i el `drop` d'aquí sota és el d'`avisa()` de cinc
-- arguments. Amb la 85 aplicada la firma ja és una altra, o sigui que aquest
-- fitxer sol deixaria viva una `avisa()` que apunta a unes taules que acaba
-- d'esborrar. Desfés-les abans, de la més nova a la més vella.

-- ── les files que impedirien estrènyer l'allowlist ──────────────────────────
delete from public.points_log where motivo in ('avis', 'avis_retirat');

-- ── les dues taules ────────────────────────────────────────────────────────
drop function if exists public.retira_avis(uuid, text);
drop function if exists public.avisa(uuid, text, text, int, uuid);
drop function if exists public.admin_set_avis_tipus(text, int, int, int, text, boolean);

drop table if exists public.avisos;
drop table if exists public.avis_tipus;

-- ── el llindar i el sostre ─────────────────────────────────────────────────
delete from public.point_values where mena = 'avisos';

alter table public.point_values drop constraint point_values_mena_check;
alter table public.point_values add constraint point_values_mena_check
  check (mena in ('motiu', 'tipus_esdeveniment'));

-- ── el llibre major torna als sis motius ───────────────────────────────────
alter table public.points_log drop constraint points_log_motivo_check;
alter table public.points_log add constraint points_log_motivo_check
  check (motivo in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'conduir', 'manual'));

-- `award_points` no cal tocar-la: la 73 no la toca. Qui la va deixar com és
-- ara és la 69, i desfer-la és cosa del seu propi rollback.

-- ── i el registre torna a les vint-i-quatre accions de la 67 ───────────────
delete from public.audit_log where accio in ('avis', 'retira_avis', 'set_avis_tipus');

alter table public.audit_log drop constraint audit_log_accio_check;

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
    'hores_persona',
    'reveal_push',
    'revoke_invite',
    'save_grau',
    'save_periods',
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

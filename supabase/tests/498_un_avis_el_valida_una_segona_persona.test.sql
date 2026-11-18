-- Un avís el proposa una persona de la junta i el valida una altra (migració 93).
--
-- EL QUE ES FIXA AQUÍ, bloc per bloc:
--   · ningú no es proposa, retira, enllaça ni edita un avís a si mateix: 42501
--     amb HINT `avis_propi`, i cada refús amb el seu control positiu;
--   · un proposat no resta punts, no surt al tauler i el soci no el veu;
--   · no el valida qui l'ha proposat (`avis_validacio_propia`) ni qui el rep;
--   · validar-lo escriu la fila de punts datada el dia de l'avís, el fa visible
--     al soci i encua una notificació SENSE la nota;
--   · retirar-ne un de proposat és rebutjar-lo: sense compensatòria, amb la seva
--     acció al registre i sense notificació; retirar-ne un de validat torna els
--     punts i avisa;
--   · el sostre es mira en proposar, comptant els proposats vius, i es torna a
--     mirar en validar, que és quan mana.
--
-- ELS HINTS ES MIREN, NO NOMÉS ELS CODIS. Tres refusos diferents tornen 42501
-- —no ser de la junta, ser l'afectat, haver-lo proposat— i la pantalla els diu
-- de tres maneres. `throws_ok` no veu el HINT; `pg_temp.hint_de` sí.
--
-- Persones i fets inventats, com a tot el repo.

begin;
select plan(47);

reset role;

-- La suite d'RLS escriu avisos de debò i no desfà res: els comptes d'aquí han
-- de sortir d'aquí.
delete from public.avisos_pendents;
delete from public.avisos;
delete from public.points_log;
delete from public.push_subscription;

update public.ranking_periods
   set starts_at = now() - interval '30 days', ends_at = null
 where mena = 'global';
update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

-- Els dos secrets de la 47, perquè la notificació s'encui de debò. Dins de la
-- transacció i per tant desfets al final.
select vault.create_secret('http://127.0.0.1:9/functions/v1/reveal-push', 'reveal_push_url');
select vault.create_secret('token-de-prova-498', 'reveal_push_token');

insert into public.push_subscription (endpoint, user_id, p256dh, auth)
values ('https://fcm.googleapis.com/fcm/send/prova-498', tests.uid('alfa'), 'clau-prova', 'auth-prova');

create temporary table qui as
select tests.uid('alfa')          as alfa,
       tests.uid('junta_alfa')    as ja,
       tests.uid('junta_bravo')   as jb,
       tests.uid('junta_charlie') as jc;
grant select on qui to authenticated;

create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;

create temporary table cua_abans as select coalesce(max(id), 0) as id from net.http_request_queue;
grant select on cua_abans to authenticated;

-- El HINT d'un refús, o null si no peta.
create function pg_temp.hint_de(p_sql text) returns text
language plpgsql as $$
declare v_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(v_hint, '');
end $$;

-- ── 1. ningú no es proposa un avís a si mateix ──────────────────────────────
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'va_deixar_ho', 'em poso un avís', -25) $$, (select ja from qui)),
  '42501', 'ningu no es pot tocar els seus propis avisos',
  'avisa(): ningú de la junta no es proposa un avís a si mateix'
);

select is(
  pg_temp.hint_de(format($$ select public.avisa(%L, 'va_deixar_ho', 'em poso un avís', -25) $$, (select ja from qui))),
  'avis_propi',
  'i el refús porta el seu nom, perquè la pantalla el digui'
);

-- El control: a una altra persona, sí.
insert into fet
select 'alfa', public.avisa((select alfa from qui), 'va_deixar_ho',
                            'va deixar la sala com la va deixar', -25);
insert into fet
select 'de_jb', public.avisa((select jb from qui), 'mal_gest', 'un avís per a la junta bravo', 0);

reset role;

-- ── 2. un proposat no compta ────────────────────────────────────────────────
select is(
  (select validat_at is null and points_log_id is null and punts = -25
     from public.avisos where id = (select id from fet where clau = 'alfa')),
  true,
  'neix proposat: sense validar, sense fila de punts, amb els punts escrits a la fila'
);

select is(
  (select count(*)::int from public.points_log where user_id = (select alfa from qui)),
  0,
  'i no resta res del llibre major mentre és proposat'
);

select is(
  (select detall->>'proposat' from public.audit_log
    where accio = 'avis' and detall->>'avis' = (select id::text from fet where clau = 'alfa')),
  'true',
  'el registre diu que s''ha proposat'
);

select tests.authenticate_as('junta_alfa');
select is(
  (select count(*)::int from jsonb_array_elements(public.admin_dashboard() -> 'punts_per_motiu') r
    where r->>'motivo' = 'avis'),
  0,
  'el tauler no el compta: no hi ha cap fila d''avís al llibre major'
);

reset role;
select tests.authenticate_as('alfa');
select is(
  (select count(*)::int from public.avisos),
  0,
  'el soci no veu el seu avís mentre és proposat'
);

reset role;
select tests.authenticate_as('junta_charlie');
select is(
  (select count(*)::int from public.avisos where id = (select id from fet where clau = 'alfa')),
  1,
  'la junta sí, que és qui l''ha de validar'
);

-- ── 3. qui no el pot validar ────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');
select throws_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'alfa')),
  '42501', 'nomes junta', 'valida_avis(): un soci no valida res, ni el seu'
);

reset role;
select tests.authenticate_as('junta_alfa');
select throws_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'alfa')),
  '42501', 'un avis el valida algu que no l''ha proposat',
  'valida_avis(): qui l''ha proposat no se''l valida'
);
select is(
  pg_temp.hint_de(format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'alfa'))),
  'avis_validacio_propia',
  'i el refús porta el seu nom'
);

reset role;
select tests.authenticate_as('junta_bravo');
select throws_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'de_jb')),
  '42501', 'ningu no es pot tocar els seus propis avisos',
  'valida_avis(): qui el rep no se''l valida, encara que sigui de la junta'
);
select is(
  pg_temp.hint_de(format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'de_jb'))),
  'avis_propi',
  'amb el mateix nom que l''autoavís'
);

select throws_ok(
  $$ select public.valida_avis('00000000-0000-4000-8000-0000000fffff') $$,
  '22023', 'aquest avis no existeix', 'valida_avis(): un avís que no existeix'
);

-- ── 4. validar-lo el fa comptar ─────────────────────────────────────────────
select lives_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'alfa')),
  'valida_avis(): una segona persona de la junta el valida'
);

reset role;

select is(
  (select pl.puntos || '|' || pl.motivo || '|' || (pl.created_at = a.created_at)::text
          || '|' || (pl.granted_by = (select ja from qui))::text
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau = 'alfa')),
  '-25|avis|true|true',
  'escriu la fila de punts, datada el dia de l''avís i a nom de qui el va proposar'
);

select is(
  (select (validat_by = (select jb from qui))::text || '|' || (validat_at is not null)::text
     from public.avisos where id = (select id from fet where clau = 'alfa')),
  'true|true',
  'i diu qui el va validar'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'valida_avis' and actor_id = (select jb from qui)
      and detall->>'avis' = (select id::text from fet where clau = 'alfa')
      and detall::text not like '%va deixar la sala%'),
  1,
  'la validació queda al registre, sense la nota'
);

select tests.authenticate_as('alfa');
select is(
  (select count(*)::int from public.avisos),
  1,
  'ara el soci el veu al seu perfil'
);

reset role;
select tests.authenticate_as('junta_alfa');
select is(
  (select (r->>'punts')::int from jsonb_array_elements(public.admin_dashboard() -> 'punts_per_motiu') r
    where r->>'motivo' = 'avis'),
  -25,
  'i el tauler ja el compta'
);

reset role;
select tests.authenticate_as('junta_charlie');
select throws_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'alfa')),
  '22023', 'aquest avis ja no espera validacio', 'valida_avis(): no es valida dues vegades'
);
select is(
  pg_temp.hint_de(format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'alfa'))),
  'avis_ja_resolt',
  'amb un nom que la pantalla pot dir quan dues persones validen alhora'
);

-- ── 5. la notificació ───────────────────────────────────────────────────────
reset role;

select is(
  (select count(*)::int from net.http_request_queue q
    where q.id > (select id from cua_abans)
      and convert_from(q.body, 'utf8')::jsonb ->> 'tipus' = 'avis'
      and convert_from(q.body, 'utf8')::jsonb ->> 'que' = 'nou'),
  1,
  'validar-lo encua una notificació per a la persona'
);

select is(
  (select (b ->> 'url') || '|' || jsonb_array_length(b -> 'subscripcions')::text
          || '|' || (b ->> 'tipus') || '|' || (q.headers ->> 'x-reveal-token')
     from net.http_request_queue q
     cross join lateral (select convert_from(q.body, 'utf8')::jsonb as b) x
    where q.id > (select id from cua_abans) and b ->> 'que' = 'nou'),
  '/perfil|1|avis|token-de-prova-498',
  'amb l''enllaç al perfil, la seva subscripció i el token de la funció de la 47'
);

select is(
  (select count(*)::int from net.http_request_queue q
    where q.id > (select id from cua_abans)
      and (convert_from(q.body, 'utf8') like '%va deixar la sala%'
           or convert_from(q.body, 'utf8') like '%va_deixar_ho%'
           or convert_from(q.body, 'utf8') like '%gravetat%')),
  0,
  'i sense la nota, ni el tipus, ni la gravetat'
);

select is(
  (select count(*)::int from net.http_request_queue q where q.id > (select id from cua_abans)),
  1,
  'proposar-lo no havia encuat res'
);

-- ── 6. ningú no es retira ni s'edita els seus ───────────────────────────────
select tests.authenticate_as('junta_bravo');

select throws_ok(
  format($$ select public.retira_avis(%L, 'me''l trec') $$, (select id from fet where clau = 'de_jb')),
  '42501', 'ningu no es pot tocar els seus propis avisos',
  'retira_avis(): ningú no es retira (ni rebutja) un avís seu'
);

select throws_ok(
  format($$ select public.edita_mesura_presa(%L, 'res a dir') $$, (select id from fet where clau = 'de_jb')),
  '42501', 'ningu no es pot tocar els seus propis avisos',
  'edita_mesura_presa(): ni s''escriu la mesura del seu'
);

select is(
  pg_temp.hint_de(format($$ select public.edita_mesura_presa(%L, 'res a dir') $$, (select id from fet where clau = 'de_jb'))),
  'avis_propi',
  'amb el mateix nom'
);

-- Els controls: la mesura d'un altre, sí.
select lives_ok(
  format($$ select public.edita_mesura_presa(%L, 'Reunió feta') $$, (select id from fet where clau = 'alfa')),
  'edita_mesura_presa(): la d''un altre, sí'
);

-- ── 7. rebutjar un proposat ─────────────────────────────────────────────────
-- Qui l'ha proposat el pot rebutjar: és retirar la seva pròpia proposta.
reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.retira_avis(%L, 'no era per tant') $$, (select id from fet where clau = 'de_jb')),
  'retira_avis(): qui l''ha proposat el rebutja'
);

reset role;

select is(
  (select (retirat_at is not null)::text || '|' || coalesce(retirat_points_log_id::text, '∅')
          || '|' || (validat_at is null)::text
     from public.avisos where id = (select id from fet where clau = 'de_jb')),
  'true|∅|true',
  'queda tancat, sense compensatòria i sense haver comptat mai'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'rebutja_avis' and detall->>'avis' = (select id::text from fet where clau = 'de_jb')),
  1,
  'i al registre és un rebuig, no una retirada'
);

select tests.authenticate_as('junta_charlie');
select throws_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'de_jb')),
  '22023', 'aquest avis ja no espera validacio', 'un rebutjat ja no es pot validar'
);

reset role;
select is(
  (select count(*)::int from net.http_request_queue q where q.id > (select id from cua_abans)),
  1,
  'rebutjar-lo no avisa ningú: la persona no en va saber mai res'
);

-- ── 8. retirar un validat ───────────────────────────────────────────────────
select tests.authenticate_as('junta_charlie');
select lives_ok(
  format($$ select public.retira_avis(%L, 'havia avisat, error nostre') $$, (select id from fet where clau = 'alfa')),
  'retira_avis(): retirar un avís validat no demana una segona persona'
);

reset role;
select is(
  (select pl.puntos from public.avisos a join public.points_log pl on pl.id = a.retirat_points_log_id
    where a.id = (select id from fet where clau = 'alfa')),
  25,
  'i torna els punts amb la compensatòria de sempre'
);

select is(
  (select count(*)::int from net.http_request_queue q
    where q.id > (select id from cua_abans)
      and convert_from(q.body, 'utf8')::jsonb ->> 'que' = 'retirat'
      and convert_from(q.body, 'utf8') not like '%error nostre%'),
  1,
  'i avisa la persona que se li ha retirat, sense el motiu'
);

-- ── 9. el sostre, en proposar i en validar ──────────────────────────────────
update public.point_values set punts = 30 where mena = 'avisos' and clau = 'sostre_curs';

select tests.authenticate_as('junta_alfa');
insert into fet
select 'sostre_1', public.avisa((select alfa from qui), 'va_deixar_ho', 'primer de dos', -20);

select throws_ok(
  format($$ select public.avisa(%L, 'va_deixar_ho', 'segon de dos', -20) $$, (select alfa from qui)),
  '22023', 'sostre de punts del curs',
  'en proposar, el sostre compta els proposats vius: dos de -20 no hi caben en 30'
);

reset role;
update public.point_values set punts = 10 where mena = 'avisos' and clau = 'sostre_curs';

select tests.authenticate_as('junta_bravo');
select is(
  pg_temp.hint_de(format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'sostre_1'))),
  'avis_sostre',
  'en validar es torna a mirar, i mana: amb el sostre baixat, ja no hi cap'
);

reset role;
update public.point_values set punts = 30 where mena = 'avisos' and clau = 'sostre_curs';
select tests.authenticate_as('junta_bravo');
select lives_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'sostre_1')),
  'i amb el sostre de nou a 30, sí'
);

-- ── 10. els pendents ────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');
insert into fet
select 'pendent', public.crea_avis_pendent(
  'Persona Prova', '955 49 80 01', now() - interval '3 days', 'mal_gest', 'Prova: pendent');

reset role;
select tests.authenticate_as('junta_bravo');
select throws_ok(
  format($$ select public.enllaca_avis_pendent(%L, %L) $$, (select id from fet where clau = 'pendent'), (select jb from qui)),
  '42501', 'ningu no es pot tocar els seus propis avisos',
  'enllaca_avis_pendent(): ningú no s''enllaça un pendent a si mateix'
);

insert into fet
select 'del_pendent', public.enllaca_avis_pendent((select id from fet where clau = 'pendent'), (select alfa from qui));

reset role;
select is(
  (select (validat_at is null)::text || '|' || (created_by = (select ja from qui))::text
     from public.avisos where id = (select id from fet where clau = 'del_pendent')),
  'true|true',
  'un pendent enllaçat és un proposat, i l''ha proposat qui va escriure el pendent'
);

select tests.authenticate_as('junta_alfa');
select is(
  pg_temp.hint_de(format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'del_pendent'))),
  'avis_validacio_propia',
  'o sigui que qui va escriure el pendent no se''l valida'
);

reset role;
select tests.authenticate_as('junta_charlie');
select lives_ok(
  format($$ select public.valida_avis(%L) $$, (select id from fet where clau = 'del_pendent')),
  'i una altra persona de la junta, sí'
);

-- ── 11. la taula ho garanteix sola ──────────────────────────────────────────
reset role;
select throws_ok(
  format($$ update public.avisos set validat_at = null where id = %L $$, (select id from fet where clau = 'sostre_1')),
  '23514', null,
  'un avís amb punts restats no pot tornar a proposat: el CHECK ho impedeix'
);

select ok(
  not has_table_privilege('authenticated', 'public.avisos', 'UPDATE'),
  'i cap grant d''UPDATE: validar només es pot fer per la RPC'
);

select * from finish();
rollback;

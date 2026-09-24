-- Els avisos pendents: qui els llegeix, qui els escriu, què val i què no, i què
-- passa amb el telèfon.
--
-- ELS TELÈFONS SÓN INVENTATS I NO SEMBLEN MÒBILS ESPANYOLS a posta: el `9` del
-- davant els treu del patró `+34[67]` que el CI refusa a les proves.
--
-- Cada fila que s'asserta es fa aquí dins, i es mira per l'id que torna cada
-- crida. L'enganxada automàtica pel telèfon és de la 88 i té el seu fitxer.

begin;
select plan(38);

reset role;
update public.ranking_periods
   set starts_at = now() - interval '30 days', ends_at = null
 where mena = 'global';
update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;
-- `tests.*` no el pot cridar una persona: l'id es pren abans.
insert into fet values ('pendent_alfa', tests.uid('pendent_alfa'));

-- ── l'estructura ───────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class where oid = 'public.avisos_pendents'::regclass),
  'la taula té RLS'
);

select ok(
  has_table_privilege('authenticated', 'public.avisos_pendents', 'SELECT')
  and not has_table_privilege('authenticated', 'public.avisos_pendents', 'INSERT')
  and not has_table_privilege('authenticated', 'public.avisos_pendents', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.avisos_pendents', 'DELETE'),
  'authenticated la pot llegir (i la política decideix qui) però no escriure-hi'
);

select ok(
  not has_table_privilege('anon', 'public.avisos_pendents', 'SELECT'),
  'anon no hi arriba'
);

select is(private.darrers_9('+34 912 34 56 78'), '912345678', 'els nou últims dígits treuen el prefix i els espais');
select is(private.darrers_9('912-34-56-78'), '912345678', 'i els guions');
select is(private.darrers_9('12 34 56'), null, 'amb menys de nou dígits no hi ha res a comparar');

-- ── la junta en crea ───────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

insert into fet
select 'u', public.crea_avis_pendent(
  'Persona Inventada U', '912 34 56 78', now() - interval '3 days',
  'no_va_venir', 'Prova: no va venir al muntatge', -10, 2, 'Trucada feta'
);

insert into fet
select 'dos', public.crea_avis_pendent(
  'Persona Inventada Dos', '+34 955 00 00 02', now() - interval '1 day',
  'mal_gest', 'Prova: un mal gest'
);

reset role;

select is(
  (select telefon_9 || '|' || gravetat || '|' || gravetat_suggerida || '|' || punts
     from public.avisos_pendents where id = (select id from fet where clau = 'u')),
  '912345678|2|1|-10',
  'es desa amb els nou dígits, la gravetat triada, la suggerida i els punts'
);

select is(
  (select gravetat from public.avisos_pendents where id = (select id from fet where clau = 'dos')),
  1,
  'sense gravetat, la del tipus'
);

select is(
  (select detall ? 'nom' or detall ? 'telefon' from public.audit_log
    where accio = 'avis_pendent' and detall->>'pendent' = (select id::text from fet where clau = 'u')),
  false,
  'l''auditoria no porta ni el nom ni el telèfon'
);

-- ── el que es refusa ───────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now() + interval '1 day', 'mal_gest', 'prova') $$,
  '22023', 'la falta no pot ser futura', 'una falta futura es refusa'
);

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '1234', now(), 'mal_gest', 'prova') $$,
  '22023', 'aixo no sembla un telefon', 'un telèfon de quatre dígits es refusa'
);

select throws_ok(
  $$ select public.crea_avis_pendent(E' \t ', '912 34 56 78', now(), 'mal_gest', 'prova') $$,
  '22023', 'sense nom no es pot reconeixer ningu', 'sense nom es refusa'
);

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now(), 'mal_gest', E'\t') $$,
  '22023', 'un avis sense motiu escrit no es un avis', 'sense nota tampoc, amb la regla del blanc de la 77'
);

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now(), 'mal_gest', 'prova', 0, 4) $$,
  '22023', 'la gravetat va d''1 a 3', 'una gravetat de quatre es refusa'
);

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now(), 'mal_gest', 'prova', 5) $$,
  '22023', 'un avis no dona punts', 'un pendent no dona punts'
);

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now() - interval '60 days', 'mal_gest', 'prova', -5) $$,
  '22023', 'la falta no cau dins de cap curs',
  'una falta d''abans del curs amb punts i sostre es refusa en crear-la'
);

select lives_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now() - interval '60 days', 'mal_gest', 'prova antiga', 0) $$,
  'però sense punts sí: la 81 refusa la resta, no l''avís'
);

-- ── un soci no hi arriba ───────────────────────────────────────────────────
reset role;
select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.avisos_pendents),
  0,
  'un soci no en llegeix cap, i n''hi ha'
);

select throws_ok(
  $$ select public.crea_avis_pendent('Algú', '912 34 56 78', now(), 'mal_gest', 'prova') $$,
  '42501', 'nomes junta', 'un soci no en crea'
);

select throws_ok(
  format($$ select public.retira_avis_pendent(%L, 'prova') $$, (select id from fet where clau = 'u')),
  '42501', 'nomes junta', 'ni en retira'
);

select throws_ok(
  format($$ select public.enllaca_avis_pendent(%L, %L) $$,
         (select id from fet where clau = 'u'), '00000000-0000-4000-8000-000000000001'),
  '42501', 'nomes junta', 'ni se n''enllaça cap a ell mateix'
);

-- ── l'enllaç manual ────────────────────────────────────────────────────────
reset role;
select tests.authenticate_as('junta_alfa');

insert into fet
select 'avis_u', public.enllaca_avis_pendent(
  (select id from fet where clau = 'u'), '00000000-0000-4000-8000-000000000004'
);

reset role;

select is(
  (select a.created_at = p.falta_at
     from public.avisos a join public.avisos_pendents p on p.avis_id = a.id
    where a.id = (select id from fet where clau = 'avis_u')),
  true,
  'l''avís porta la data de la falta, no la de l''enllaç'
);

select is(
  (select pl.created_at = a.created_at and pl.puntos = -10
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau = 'avis_u')),
  true,
  'i la fila de punts també, perquè compti al curs i al trimestre de la falta'
);

select is(
  (select a.gravetat || '|' || a.nota || '|' || a.mesura_presa || '|' || (a.created_by = tests.uid('junta_alfa'))
     from public.avisos a where a.id = (select id from fet where clau = 'avis_u')),
  '2|Prova: no va venir al muntatge|Trucada feta|true',
  'amb la gravetat, la nota, la mesura i l''autor del pendent'
);

select is(
  (select coalesce(telefon, '∅') || '|' || coalesce(telefon_9, '∅') || '|' || enllacat_via
     from public.avisos_pendents where id = (select id from fet where clau = 'u')),
  '∅|∅|ma',
  'en enllaçar-lo, el telèfon se''n va: n''hi ha prou amb avis_id'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'avis' and detall->>'pendent' = (select id::text from fet where clau = 'u')
      and detall->>'via' = 'ma'),
  1,
  'l''avís té la mateixa auditoria que avisa(), i diu de quin pendent ve'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'enllaca_avis_pendent' and detall->>'pendent' = (select id::text from fet where clau = 'u')),
  1,
  'i l''enllaç queda al registre a part'
);

select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.enllaca_avis_pendent(%L, %L) $$,
         (select id from fet where clau = 'u'), '00000000-0000-4000-8000-000000000004'),
  '22023', 'aquest pendent ja esta resolt', 'un pendent enllaçat no es torna a enllaçar'
);

select throws_ok(
  format($$ select public.enllaca_avis_pendent(%L, %L) $$,
         (select id from fet where clau = 'dos'), (select id from fet where clau = 'pendent_alfa')),
  '22023', 'aquesta persona no es de l''associacio',
  'a un perfil pendent no se li enllaça res, com a avisa()'
);

-- El sostre també val a mà, i l'error puja a la junta amb el seu HINT.
reset role;
update public.point_values set punts = 5 where mena = 'avisos' and clau = 'sostre_curs';
select tests.authenticate_as('junta_alfa');

insert into fet
select 'massa', public.crea_avis_pendent(
  'Persona Inventada Tres', '955 00 00 03', now() - interval '1 day', 'no_va_venir', 'Prova: sostre', -10
);

select throws_ok(
  format($$ select public.enllaca_avis_pendent(%L, %L) $$,
         (select id from fet where clau = 'massa'), '00000000-0000-4000-8000-000000000004'),
  '22023', 'sostre de punts del curs',
  'l''enllaç manual respecta el sostre, i l''error puja'
);

-- ── retirar-ne un ──────────────────────────────────────────────────────────
select throws_ok(
  format($$ select public.retira_avis_pendent(%L, ' ') $$, (select id from fet where clau = 'dos')),
  '22023', 'retirar un avis tambe demana un motiu escrit', 'retirar demana nota'
);

select lives_ok(
  format($$ select public.retira_avis_pendent(%L, 'Prova: era una altra persona') $$,
         (select id from fet where clau = 'dos')),
  'la junta en retira un'
);

reset role;
select is(
  (select coalesce(telefon, '∅') || '|' || retirat_nota
     from public.avisos_pendents where id = (select id from fet where clau = 'dos')),
  '∅|Prova: era una altra persona',
  'i en retirar-lo el telèfon també se''n va'
);

select throws_ok(
  format($$ update public.avisos_pendents set telefon = '955 00 00 09' where id = %L $$,
         (select id from fet where clau = 'dos')),
  '23514', null,
  'un pendent resolt no pot tornar a tenir telèfon: ho diu un CHECK de la taula'
);

-- ── la purga ───────────────────────────────────────────────────────────────
-- En aquest punt hi ha quatre pendents fets aquí: `u` enllaçat, `dos` retirat,
-- i `massa` i el de la falta antiga esperant. Tots tenen la falta abans d'ara.

-- UN CURS QUE ENCARA NO HA COMENÇAT NO ES TANCA RES. `periode_curs()` tria la
-- fila `global` per ordre i no per data: un `starts_at` al futur —un error, o el
-- calendari de setembre escrit massa d'hora— faria que «anterior al curs» fos
-- tot el curs que corre, i la purga és un `delete`.
update public.ranking_periods set starts_at = now() + interval '30 days' where mena = 'global';

select is(
  private.purga_avis_pendents(),
  0,
  'amb el començament del curs al futur, la purga no esborra res'
);

select is(
  (select count(*)::int from public.avisos_pendents p
    where p.id in (select id from fet) or p.nota = 'prova antiga'),
  4,
  'i els quatre pendents d''aquest fitxer hi continuen tots'
);

-- La finestra del curs es mou endavant, que és el que passa quan la junta
-- escriu el calendari nou: les faltes d'aquest fitxer queden en un curs tancat.
-- Se'n van els que esperen i els retirats —d'aquests només hi quedaven el nom i
-- la nota d'algú sense compte—; l'enllaçat es queda, perquè el seu avís ja viu
-- a `avisos`.
update public.ranking_periods set starts_at = now() - interval '12 hours' where mena = 'global';
select private.purga_avis_pendents();

select is(
  (select string_agg(f.clau, ',' order by f.clau)
     from fet f join public.avisos_pendents p on p.id = f.id),
  'u',
  'en tancar el curs, se''n van els que esperen i els retirats, i l''enllaçat es queda'
);

select is(
  (select count(*)::int from public.avisos_pendents where nota = 'prova antiga'),
  0,
  'també el de la falta antiga que esperava'
);

select * from finish();
rollback;

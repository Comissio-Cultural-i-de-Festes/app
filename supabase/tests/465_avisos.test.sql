-- Els avisos de la junta, des de dins de la base.
--
-- QUATRE COSES QUE AQUEST FITXER FIXA I QUE NO ES VEUEN DES DE CAP PANTALLA.
--
-- La primera és que un soci no pot escriure a `avisos` de cap manera. No hi ha
-- grant, i per tant el refús és 42501 i NO zero files. La diferència importa:
-- `USING` filtra en silenci i `WITH CHECK` peta, i una prova que esperi
-- `is_empty` passaria per sempre el dia que algú afegís un grant i una política
-- permissiva. Per això cada refús d'escriptura mira el CODI.
--
-- La segona és que retirar un avís escriu la compensació EXACTA. Es comprova
-- contra la fila del llibre major i no contra el saldo: amb el saldo, un avís
-- mal restat i una compensació mal escrita es taparien l'un a l'altre.
--
-- La tercera és la separació entre on va passar una cosa i d'on surten uns
-- punts. Un avís posat en una reunió de junta es queda amb la reunió, i la seva
-- fila de `points_log` hi va sense esdeveniment, perquè
-- `private.no_points_from_junta_meetings` no la deixaria passar. Les dues
-- assercions van juntes; una de sola no diria res.
--
-- I la quarta és que la nota NO va a `audit_log`. El registre es purga als 24
-- mesos i el llegeix tota la junta; la nota viu a `avisos`, que és on la pot
-- llegir qui hi surt.
--
-- CADA REFÚS PORTA EL SEU CONTROL POSITIU, com demana el capçal de la 370: una
-- prova que només comprova que una cosa peta passaria igual el dia que peti
-- sempre.
--
-- I CADA REFÚS PORTA TAMBÉ EL SEU MISSATGE, que és la meitat que faltava. Les
-- vint-i-tres crides a `throws_ok` passaven `null` per missatge, i dins
-- d'`avisa()` hi ha set `raise` diferents que tornen tots el mateix 22023 —nota
-- buida, tipus desconegut, punts positius, punts fora de rang, no és de
-- l'associació, sostre del curs— i dins de `retira_avis()` tres més. Amb el
-- missatge a null, un sol `raise` que es dispari ABANS que el previst satisfà
-- unes quantes assercions alhora: la prova del sostre passaria igual el dia que
-- la crida petés per un tipus mal escrit, i ningú no ho veuria. Amb el missatge,
-- cada asserció mira la seva verja i no la primera que es tanqui. És el que fa
-- `460_l_ajust_a_ma_va_amb_nota.test.sql` i el motiu és aquest.
--
-- ELS QUATRE REFUSOS DE GRANT també el porten, i allà el missatge el genera
-- Postgres i diu QUINA taula. Sense ell, «un soci no pot inserir a avisos»
-- passaria igual el dia que la sentència petés per una altra taula qualsevol.
--
-- LA FINESTRA DEL CURS ES FIXA AQUÍ DINS, relativa a `now()`, pel mateix motiu
-- que a la 440: la que ve de la llavor depèn del mes en què algú faci el reset.
--
-- Persones i fets inventats, com a tot el repo.

begin;
select plan(62);

reset role;

-- Res del que hi hagi de la llavor: els saldos han de sortir d'aquí i d'enlloc
-- més.
--
-- I `avisos` TAMBÉ S'HI BUIDA, que no és zel. La suite d'RLS escriu avisos de
-- veritat per `avisa()` i no desfà res, o sigui que en una base on ja hagi
-- corregut hi ha files d'abans. Sense aquesta línia, els recomptes de la
-- secció 6 —«el bravo només veu el seu»— compten aquelles i fallen segons
-- l'ordre en què s'hagin executat les dues capes. Es va veure corrent la
-- pgTAP després de l'RLS en comptes d'abans.
delete from public.avisos;
delete from public.points_log;
delete from public.events;

update public.ranking_periods
   set starts_at = now() - interval '30 days',
       ends_at   = null
 where mena = 'global';

create temporary table quins as
select '00000000-0000-4000-8000-0000000fa001'::uuid as festa,
       '00000000-0000-4000-8000-0000000fa002'::uuid as reunio;
grant select on quins to authenticated;

insert into public.events (id, tipo, abast, starts_at, puntos, published)
select q.festa,  'actividad', 'comi',  now() - interval '8 days', 10, true from quins q
union all
select q.reunio, 'reunio',    'junta', now() - interval '7 days',  0, true from quins q;

-- Els identificadors, guardats abans de canviar de rol: dins d'una persona,
-- `tests.*` és inaccessible. La taula temporal necessita el seu grant per
-- sobreviure el canvi de rol, igual que a la 440.
create temporary table qui as
select tests.uid('alfa')        as alfa,
       tests.uid('bravo')       as bravo,
       tests.uid('junta_alfa')  as junta,
       tests.uid('pendent_alfa') as pendent,
       tests.uid('baixa_alfa')  as baixa;
grant select on qui to authenticated;

-- On es desen els identificadors que fabriquen les proves. Cal INSERT i UPDATE
-- perquè s'hi escriu des de dins d'una persona.
create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;

-- ── 1. la porta d'escriptura, que no existeix ───────────────────────────────
-- Tres verges, i totes tres són un grant que falta i no una política que falta.

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  $$ insert into public.avisos (user_id, tipus, gravetat, nota)
     values ('00000000-0000-4000-8000-000000000001', 'no_va_venir', 1, 'per la porta del darrere') $$,
  '42501', 'permission denied for table avisos', 'un soci no pot inserir a avisos'
);

select throws_ok(
  $$ update public.avisos set nota = 'una altra cosa' $$,
  '42501', 'permission denied for table avisos', 'un soci no pot editar cap avis'
);

select throws_ok(
  $$ delete from public.avisos $$,
  '42501', 'permission denied for table avisos', 'un soci no pot esborrar cap avis'
);

select throws_ok(
  $$ update public.avis_tipus set punts_suggerits = 0 $$,
  '42501', 'permission denied for table avis_tipus', 'un soci no pot tocar el cataleg'
);

-- El control positiu de les quatre: el cataleg SI que es llegeix, que es el que
-- posa nom al seu propi avis a la seva pantalla.
--
-- ELS QUATRE SEMBRATS I NO «EXACTAMENT QUATRE FILES». La junta pot afegir tipus
-- des de `/junta/barem` sense desplegar —es el proposit de la taula— i aquest
-- fitxer buida `avisos`, `points_log` i `events` pero no `avis_tipus`, que no
-- s'ha de buidar: hi ha avisos de cursos passats que hi apunten. Un recompte
-- exacte convertia una accio normal del producte en una prova vermella, i va
-- passar: afegint un tipus per la pantalla, aquesta asercio queia. La d'RLS del
-- costat ja ho te escrit —«mai exactament quatre»— i aquesta deia el contrari.
--
-- El que la prova ha de dir es que el soci VEU els quatre que la migracio sembra,
-- que es el que li posa nom al seu avis. Que n'hi hagi mes no la contradiu.
select is(
  (select count(*)::int from public.avis_tipus
    where clau in ('no_va_venir', 'mal_gest', 'va_deixar_ho', 'greu')),
  4,
  'pero el soci llegeix el cataleg, que es el que li posa nom a l''avis'
);

-- ── 2. les portes d'`avisa()` ───────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'jo mateix', 0, null) $$, (select alfa from qui)),
  '42501', 'nomes junta', 'avisa(): un soci no avisa ningu, ni ell mateix'
);

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'no_va_venir', '   ', 0, null) $$, (select alfa from qui)),
  '22023', 'un avis sense motiu escrit no es un avis', 'avisa(): una nota en blanc no es una nota'
);

select throws_ok(
  format($$ select public.avisa(%L, 'inventat', 'un motiu escrit', 0, null) $$, (select alfa from qui)),
  '22023', 'tipus d''avis desconegut', 'avisa(): un tipus que no es al cataleg'
);

select throws_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'un motiu escrit', 10, null) $$, (select alfa from qui)),
  '22023', 'un avis no dona punts', 'avisa(): un avis no dona punts'
);

select throws_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'un motiu escrit', -600, null) $$, (select alfa from qui)),
  '22023', 'punts fora de rang', 'avisa(): i tampoc no en treu sis-cents'
);

select throws_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'un motiu escrit', 0, null) $$, (select pendent from qui)),
  '22023', 'aquesta persona no es de l''associacio', 'avisa(): un pendent encara no ha entrat a l''associacio'
);

-- El control positiu del pendent: qui ja es de baixa SI que es pot avisar,
-- perque tancar un expedient te sentit.
select lives_ok(
  format($$ select public.avisa(%L, 'mal_gest', 'tancant l''expedient', 0, null) $$, (select baixa from qui)),
  'avisa(): a qui ja es de baixa si, que es com es tanca un expedient'
);

-- ── 3. l'avis que si que s'escriu ───────────────────────────────────────────

reset role;
select tests.authenticate_as('junta_alfa');

insert into fet (clau, id)
select 'amb_punts',
       public.avisa((select alfa from qui), 'va_deixar_ho',
                    'va deixar la sala com la va deixar', -25, (select festa from quins));

reset role;

select is(
  (select a.gravetat from public.avisos a where a.id = (select id from fet where clau='amb_punts')),
  2,
  'la gravetat es copia del cataleg i no es resol per join'
);

select is(
  (select pl.puntos
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau='amb_punts')),
  -25,
  'la fila del llibre major porta els punts de l''avis'
);

select is(
  (select pl.motivo
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau='amb_punts')),
  'avis',
  'i el motiu nou'
);

select is(
  (select a.created_by from public.avisos a where a.id = (select id from fet where clau='amb_punts')),
  (select junta from qui),
  'i qui l''ha posat'
);

-- ── 4. un avis sense punts no toca el llibre major ──────────────────────────

reset role;
select tests.authenticate_as('junta_alfa');

insert into fet (clau, id)
select 'sense_punts',
       public.avisa((select bravo from qui), 'mal_gest', 'primer avis, sense tocar el ranquing', 0, null);

reset role;

select is(
  (select a.points_log_id from public.avisos a where a.id = (select id from fet where clau='sense_punts')),
  null,
  'un avis de zero punts no escriu cap fila al llibre major'
);

select is(
  (select count(*)::int from public.points_log where user_id = (select bravo from qui)),
  0,
  'i el saldo del bravo segueix intacte'
);

-- ── 5. la reunio de junta, i la separacio que obliga ────────────────────────
-- Les dues assercions van juntes: una de sola no diria res.

reset role;
select tests.authenticate_as('junta_alfa');

insert into fet (clau, id)
select 'a_la_reunio',
       public.avisa((select alfa from qui), 'no_va_venir',
                    'no va venir a la reunio', -10, (select reunio from quins));

reset role;

select is(
  (select a.event_id from public.avisos a where a.id = (select id from fet where clau='a_la_reunio')),
  (select reunio from quins),
  'l''avis es queda amb la reunio, que es on va passar'
);

select is(
  (select pl.event_id
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau='a_la_reunio')),
  null,
  'i la fila de punts hi va sense esdeveniment, que es l''unica manera que passi la tanca de la 49'
);

-- El control positiu: en una activitat normal, la fila de punts SI que se'l
-- queda.
select is(
  (select pl.event_id
     from public.avisos a join public.points_log pl on pl.id = a.points_log_id
    where a.id = (select id from fet where clau='amb_punts')),
  (select festa from quins),
  'en una activitat normal la fila de punts se''l queda'
);

-- ── 6. qui ho veu ───────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select is(
  (select count(*)::int from public.avisos),
  2,
  'l''alfa veu els seus dos avisos'
);

select is(
  (select count(*)::int from public.avisos where user_id <> (select alfa from qui)),
  0,
  'i cap dels altres'
);

reset role;
select tests.authenticate_as('bravo');

select is(
  (select count(*)::int from public.avisos),
  1,
  'el bravo nomes veu el seu'
);

reset role;
select tests.authenticate_as('junta_alfa');

select is(
  (select count(*)::int from public.avisos),
  4,
  'la junta els veu tots quatre'
);

-- ── 7. retirar ──────────────────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  format($$ select public.retira_avis(%L, 'perque si') $$, (select id from fet where clau='amb_punts')),
  '42501', 'nomes junta', 'retira_avis(): un soci no retira el seu propi avis'
);

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.retira_avis(%L, '  ') $$, (select id from fet where clau='amb_punts')),
  '22023', 'retirar un avis tambe demana un motiu escrit', 'retira_avis(): retirar tambe demana un motiu escrit'
);

select throws_ok(
  $$ select public.retira_avis('00000000-0000-4000-8000-0000000fffff', 'un motiu') $$,
  '22023', 'aquest avis no existeix', 'retira_avis(): un avis que no existeix'
);

select lives_ok(
  format($$ select public.retira_avis(%L, 'havia avisat, error nostre') $$,
         (select id from fet where clau='amb_punts')),
  'retira_avis(): la junta si'
);

select throws_ok(
  format($$ select public.retira_avis(%L, 'un altre cop') $$, (select id from fet where clau='amb_punts')),
  '22023', 'aquest avis ja esta retirat', 'retira_avis(): i no dos cops'
);

reset role;

select is(
  (select pl.puntos
     from public.avisos a join public.points_log pl on pl.id = a.retirat_points_log_id
    where a.id = (select id from fet where clau='amb_punts')),
  25,
  'la compensacio es exactament el contrari de la resta'
);

select is(
  (select pl.motivo
     from public.avisos a join public.points_log pl on pl.id = a.retirat_points_log_id
    where a.id = (select id from fet where clau='amb_punts')),
  'avis_retirat',
  'amb el seu motiu propi, que es el que fa que la retirada sigui un acte i no una absencia'
);

select is(
  (select pl.event_id
     from public.avisos a join public.points_log pl on pl.id = a.retirat_points_log_id
    where a.id = (select id from fet where clau='amb_punts')),
  null,
  'i sense esdeveniment: no es res que hagi passat enlloc'
);

select isnt(
  (select a.retirat_at from public.avisos a where a.id = (select id from fet where clau='amb_punts')),
  null,
  'l''avis queda marcat com a retirat'
);

select is(
  (select a.retirat_by from public.avisos a where a.id = (select id from fet where clau='amb_punts')),
  (select junta from qui),
  'i diu qui el va retirar'
);

-- La fila NO desapareix: es el que explica dos moviments del llibre major.
select is(
  (select count(*)::int from public.avisos where id = (select id from fet where clau='amb_punts')),
  1,
  'retirar no esborra la fila, que es el que explica els dos moviments'
);

-- ── 7b. retirar el que no en va restar cap ──────────────────────────────────
-- EL PRIMER AVIS NORMAL ES EL DE ZERO PUNTS —es el cas que la 73 defensa— i
-- retirar-ne un era l'unica branca de `retira_avis()` que no tocava cap prova
-- de cap capa: la seccio 7 nomes retira el que va restar punts i la suite
-- d'RLS no en retira cap. La branca es un `if points_log_id is not null`, o
-- sigui que el dia que algu la simplifiqui malament, el que passaria es un
-- `-null` o una compensacio de zero punts al llibre major de tothom que hagi
-- tingut un primer avis, i no ho veuria ningu fins a la seguent lectura del
-- perfil.
--
-- Les quatre assercions van juntes: que la retirada passi no diu res si no es
-- comprova a la vegada que el llibre major segueix sense tocar.

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.retira_avis(%L, 'ho vam parlar i estava mal apuntat') $$,
         (select id from fet where clau='sense_punts')),
  'retira_avis(): un avis que no va restar punts tambe es pot retirar'
);

reset role;

select isnt(
  (select a.retirat_at from public.avisos a where a.id = (select id from fet where clau='sense_punts')),
  null,
  'i queda marcat com a retirat igualment'
);

select is(
  (select a.retirat_nota from public.avisos a where a.id = (select id from fet where clau='sense_punts')),
  'ho vam parlar i estava mal apuntat',
  'amb el motiu escrit, que tambe hi es obligatori'
);

select is(
  (select a.retirat_points_log_id from public.avisos a
    where a.id = (select id from fet where clau='sense_punts')),
  null,
  'i sense compensatoria: no hi havia res a tornar'
);

select is(
  (select count(*)::int from public.points_log where user_id = (select bravo from qui)),
  0,
  'el llibre major del bravo segueix sense una sola fila'
);

-- ── 8. el sostre del curs ───────────────────────────────────────────────────
-- L'alfa porta -10 dins la finestra: el -25 i el +25 s'han cancel·lat.

reset role;

select is(
  (select coalesce(sum(puntos),0)::int from public.points_log
    where user_id = (select alfa from qui) and motivo in ('avis','avis_retirat')),
  -10,
  'el saldo d''avisos de l''alfa, despres de la retirada'
);

update public.point_values set punts = 15 where mena = 'avisos' and clau = 'sostre_curs';

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'passaria del sostre', -10, null) $$, (select alfa from qui)),
  '22023', 'sostre de punts del curs', 'el sostre del curs atura la resta que el passaria'
);

select lives_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'just al sostre', -5, null) $$, (select alfa from qui)),
  'i deixa passar la que hi arriba justa'
);

reset role;
update public.point_values set punts = 0 where mena = 'avisos' and clau = 'sostre_curs';

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.avisa(%L, 'greu', 'sostre a zero vol dir sense sostre', -50, null) $$,
         (select alfa from qui)),
  'un sostre de zero vol dir sense sostre'
);

-- ── 9. el comptador caduca amb el curs ──────────────────────────────────────
-- Una resta d'un curs anterior no compta per al sostre d'aquest. Es fabrica
-- directament perque `avisa()` sempre escriu amb `now()`.

reset role;

insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by, created_at)
values ((select bravo from qui), null, 'avis', -400, 'curs passat',
        (select junta from qui), now() - interval '400 days');

update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.avisa(%L, 'no_va_venir', 'el curs passat no compta', -10, null) $$,
         (select bravo from qui)),
  'una resta de fora de la finestra no gasta el sostre d''aquest curs'
);

reset role;

select is(
  (select coalesce(sum(pl.puntos),0)::int
     from public.points_log pl
    where pl.user_id = (select bravo from qui)
      and pl.motivo in ('avis','avis_retirat')
      and pl.created_at >= (select des_de from private.periode_curs())),
  -10,
  'dins la finestra del curs el bravo nomes hi porta la d''ara'
);

-- ── 10. `award_points` no es la porta dels avisos ───────────────────────────
-- QUI POT RESTAR PER `award_points` NO ES COSA D'AQUEST FITXER. La migració 72
-- (issue #3) hi posa nota obligatòria per a `manual` i deixa que un admin resti
-- només amb aquell motiu; aquesta migració no la toca i les seves proves són
-- allà. El que sí que és cosa d'aquí és que els dos motius nous NO hi entrin:
-- l'única porta a una fila d'avís ha de ser `avisa()`, que és qui copia la
-- gravetat, mira el sostre i deixa la fila d'`avisos` al costat.

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.award_points(%L, null, 'avis', -25, 'per la porta del costat') $$, (select alfa from qui)),
  '22023', 'motiu invalid', 'award_points(): pero no pot posar-hi el motiu d''un avis'
);

select throws_ok(
  format($$ select public.award_points(%L, null, 'avis_retirat', 25, 'ni el de la retirada') $$, (select alfa from qui)),
  '22023', 'motiu invalid', 'award_points(): ni el de la retirada'
);

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  format($$ select public.award_points(%L, null, 'manual', -5, 'jo mateix') $$, (select alfa from qui)),
  '42501', 'nomes junta', 'award_points(): i un soci segueix sense poder restar res'
);

-- I el control positiu del refús dels dos motius nous: amb un motiu de sempre,
-- la funció segueix funcionant. Sense això, un `award_points` que petés per
-- qualsevol cosa faria passar les dues assercions de dalt per sempre.
reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.award_points(%L, null, 'manual', 5, 'un motiu de sempre') $$,
         (select alfa from qui)),
  'award_points(): i amb un motiu de sempre segueix funcionant'
);

-- ── 11. el cataleg, per RPC ─────────────────────────────────────────────────

reset role;
select tests.authenticate_as('alfa');

select throws_ok(
  $$ select public.admin_set_avis_tipus('provatipus', 1, -5, 9, null, true) $$,
  '42501', 'nomes junta', 'admin_set_avis_tipus(): un soci no toca el cataleg'
);

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.admin_set_avis_tipus('provatipus', 4, -5, 9, null, true) $$,
  '22023', 'la gravetat va d''1 a 3', 'admin_set_avis_tipus(): la gravetat va d''1 a 3'
);

select throws_ok(
  $$ select public.admin_set_avis_tipus('provatipus', 1, 5, 9, null, true) $$,
  '22023', 'els punts suggerits van de -500 a 0', 'admin_set_avis_tipus(): els punts suggerits no poden ser positius'
);

select throws_ok(
  $$ select public.admin_set_avis_tipus('Prova Tipus', 1, -5, 9, null, true) $$,
  '22023', 'clau invalida', 'admin_set_avis_tipus(): la clau te la seva forma'
);

select lives_ok(
  $$ select public.admin_set_avis_tipus('se_en_va_aviat', 1, -15, 9, 'Se''n va abans d''hora', true) $$,
  'admin_set_avis_tipus(): la junta en crea un, amb etiqueta per als locales que no el coneixen'
);

-- Retirar un tipus el treu del formulari sense trencar els avisos que ja
-- l'usen: es `actiu = false` i no un DELETE.
select lives_ok(
  $$ select public.admin_set_avis_tipus('se_en_va_aviat', 1, -15, 9, 'Se''n va abans d''hora', false) $$,
  'i el pot retirar'
);

select throws_ok(
  format($$ select public.avisa(%L, 'se_en_va_aviat', 'amb un tipus retirat', 0, null) $$, (select alfa from qui)),
  '22023', 'tipus d''avis desconegut', 'i un tipus retirat ja no avisa ningu'
);

-- ── 12. el registre ─────────────────────────────────────────────────────────

reset role;

select isnt(
  (select count(*)::int from public.audit_log where accio = 'avis'),
  0,
  'avisar queda al registre'
);

select isnt(
  (select count(*)::int from public.audit_log where accio = 'retira_avis'),
  0,
  'retirar tambe'
);

select isnt(
  (select count(*)::int from public.audit_log where accio = 'set_avis_tipus'),
  0,
  'i tocar el cataleg tambe'
);

-- I la nota no hi es. `audit_log` es purga als 24 mesos i el llegeix tota la
-- junta; la nota viu a `avisos`.
select is(
  (select count(*)::int from public.audit_log
    where accio = 'avis' and detall::text like '%va deixar la sala%'),
  0,
  'pero la nota no va al registre: viu a avisos, que es on la llegeix qui hi surt'
);

select * from finish();
rollback;

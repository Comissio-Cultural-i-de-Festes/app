-- El sostre del curs quan AVUI cau fora de la finestra del curs.
--
-- QUE ES MIRA. `avisa()` decideix si deixa passar una resta comparant el
-- sostre amb el que ja s'ha gastat DINS la finestra de `private.periode_curs()`.
-- La migracio 78 va arreglar de quin curs es cada moviment —el de l'avis que
-- l'explica i no el de la seva propia data—, i amb aixo la compensacio d'un
-- avis vell ja no obre marge en aquest curs. El que cap de les dues versions
-- mirava es si la fila que esta A PUNT D'ESCRIURE cau dins de la finestra.
--
-- I no hi cau sempre. `avisa()` escriu amb `now()`, i `ranking_periods` no
-- obliga enlloc que la finestra `global` contingui el dia d'avui:
-- `admin_save_periods` comprova els codis, les menes, els ordres repetits, que
-- un periode no acabi abans de comencar i que els trimestres vagin seguits, i
-- res mes. O sigui que hi ha dos dies normals en que AVUI queda fora:
--
--   · el curs que ve ja esta escrit i encara no ha comencat —la junta prepara
--     el calendari al juliol, que es quan es prepara—; i
--   · el curs s'ha acabat i ningu no ha obert el seguent.
--
-- Mentre durava qualsevol dels dos, cada avis nou s'escrivia amb una data que
-- la finestra no cobreix, o sigui que el gastat que `avisa()` suma sortia
-- sempre zero i el sostre no fitava res: es podia repetir la mateixa resta
-- tantes vegades com es volgues. L'unica verja que quedava era l'`abs(punts) >
-- 500` per crida, que es exactament la que l'issue #4 va dir que no bastava:
-- «`abs(punts) > 500` per crida no impedeix repetir la crida».
--
-- ── QUE HA CANVIAT EN AQUEST FITXER, I PER QUE ─────────────────────────────
--
-- La versio anterior no afirmava quin comportament era el correcte: afirmava
-- quin era el d'avui, amb numeros, perque no hi havia cap prova que el fixes
-- en cap sentit. I deia, amb totes les lletres, que «si un dia es decideix que
-- `avisa()` ha de refusar —o comptar— una fila que cau fora del curs, les dues
-- assercions de sota canvien de sentit i es veura que ha canviat».
--
-- Aquell dia es la migracio 81, i es refusar. Les assercions 3 i 4 son les dues
-- que van canviar de sentit, i son les uniques: el control de dalt —que amb
-- avui DINS la finestra el sostre fita el total i no cada crida— es el que
-- l'issue demana i no s'ha tocat ni una coma. Les assercions 5 i 6 son noves i
-- fixen l'abast de la decisio: es refusa la RESTA i no l'avis, i nomes quan hi
-- ha sostre escrit.
--
-- Gent i fets inventats, com a tot el repo.

begin;
select plan(8);

reset role;

delete from public.avisos;
delete from public.points_log;

update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

create temporary table qui as
select tests.uid('alfa') as alfa, tests.uid('bravo') as bravo;
grant select on qui to authenticated;

-- El camp HINT del refus, que es el que la pantalla llegeix.
--
-- `throws_ok` mira el codi i el missatge i no el HINT, i el HINT es justament
-- el que distingeix aquests dos refusos dels altres cinc d'`avisa()`, que son
-- tots 22023. Sense aixo, canviar el token —o treure'l— no posaria res vermell
-- i la junta tornaria a llegir «torna-ho a provar d'aqui un moment» davant
-- d'un sostre, que es el consell que no pot funcionar mai.
create temporary table pista (cas text primary key, hint text);
grant select, insert on pista to authenticated;

-- ── 1. el control: amb AVUI dins la finestra, el sostre fita ───────────────
update public.ranking_periods
   set starts_at = now() - interval '10 days',
       ends_at   = null
 where mena = 'global';

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.avisa(%L, 'greu', 'gasta el sostre sencer', -200, null) $$,
         (select alfa from qui)),
  'amb avui dins la finestra, la primera resta de 200 hi cap'
);

select throws_ok(
  format($$ select public.avisa(%L, 'greu', 'i una mes', -200, null) $$, (select alfa from qui)),
  '22023', 'sostre de punts del curs',
  'i la segona ja no: el sostre del curs fita el total, no cada crida'
);

do $$
declare v_hint text;
begin
  begin
    perform public.avisa((select alfa from qui), 'greu', 'i una altra', -200, null);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into pista (cas, hint) values ('sostre', v_hint);
  end;
end $$;

select is(
  (select hint from pista where cas = 'sostre'),
  'avis_sostre',
  'i el refus del sostre es diu pel seu nom, que es el que la pantalla llegeix'
);

-- ── 2. el curs encara no ha comencat ───────────────────────────────────────
-- La junta ha escrit el calendari del curs que ve i el d'ara ja no hi es. No
-- es cap estat corrupte: `admin_save_periods` ho accepta sense dir res.
reset role;

update public.ranking_periods
   set starts_at = now() + interval '12 days',
       ends_at   = null
 where mena = 'global';

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'greu', 'una', -200, null) $$, (select bravo from qui)),
  '22023', 'avui no cau dins de cap curs',
  'amb el curs sense comencar, no es pot restar: sense curs no hi ha sostre que comptar'
);

do $$
declare v_hint text;
begin
  begin
    perform public.avisa((select bravo from qui), 'greu', 'una', -200, null);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    insert into pista (cas, hint) values ('fora', v_hint);
  end;
end $$;

select is(
  (select hint from pista where cas = 'fora'),
  'avis_fora_del_curs',
  'i aquest tambe, i amb un token diferent: son dos remeis diferents'
);

reset role;

select is(
  (select coalesce(sum(pl.puntos), 0)::int
     from public.points_log pl
    where pl.user_id = (select bravo from qui)
      and pl.motivo in ('avis', 'avis_retirat')),
  0,
  'i no s''ha escrit cap fila: el refus es abans de tocar el llibre major'
);

-- ── 3. el que NO es refusa ─────────────────────────────────────────────────
-- Es refusa la resta, no l'avis. Un avis de zero punts es el primer avis normal
-- —la migracio 73 el defensa com a tal— i no toca cap sostre, o sigui que la
-- junta que treballa al juliol continua podent avisar.
reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.avisa(%L, 'greu', 'sense punts, fora del curs', 0, null) $$,
         (select bravo from qui)),
  'i un avis sense punts passa igualment: el que es refusa es la resta'
);

-- ── 4. i sense sostre escrit no hi ha res a honorar ────────────────────────
-- Zero vol dir «sense sostre», com a tot arreu. Si la junta ha dit que no en
-- vol, el refus de mes amunt seria una restriccio nova que ningu no ha demanat.
reset role;
update public.point_values set punts = 0 where mena = 'avisos' and clau = 'sostre_curs';

reset role;
select tests.authenticate_as('junta_alfa');

select lives_ok(
  format($$ select public.avisa(%L, 'greu', 'sense sostre escrit', -200, null) $$,
         (select bravo from qui)),
  'amb el sostre a zero, restar fora del curs continua passant: no hi ha sostre que comptar'
);

select * from finish();
rollback;

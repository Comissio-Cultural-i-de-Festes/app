-- El sostre del curs i la compensacio d'un avis del curs passat.
--
-- QUE ES MIRA. `avisa()` calcula el que ja s'ha gastat del sostre sumant les
-- files de `points_log` amb motiu `avis` I `avis_retirat` DINS de la finestra
-- del curs. La fila compensatoria la escriu `retira_avis()` amb `now()`, no amb
-- la data de l'avis que retira, i la fila d'un avis no caduca mai: el boto de
-- retirar surt a totes les files vives de la fitxa, siguin del curs que siguin.
--
-- O sigui que retirar un avis d'un curs anterior deixa un `+N` dins la finestra
-- d'AQUEST curs sense que aquest curs hagi gastat mai aquells punts, i el marge
-- que en surt es mes gran que el sostre que la junta ha escrit.
--
-- Aquest fitxer NO afirma quin dels dos comportaments es el correcte. Afirma
-- quin es el d'avui, amb numeros, perque ara mateix no hi ha cap prova que el
-- fixi en cap sentit i el dia que algu canvii la finestra del `sum` no se
-- n'assabentara ningu.
--
-- Gent i fets inventats, com a tot el repo.

begin;
select plan(4);

reset role;

delete from public.avisos;
delete from public.points_log;

update public.ranking_periods
   set starts_at = now() - interval '30 days',
       ends_at   = null
 where mena = 'global';

update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

create temporary table qui as
select tests.uid('alfa') as alfa, tests.uid('junta_alfa') as junta;
grant select on qui to authenticated;

create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;

-- ── un avis del curs PASSAT, amb els seus punts ────────────────────────────
-- Es fabrica a ma perque `avisa()` sempre escriu amb `now()`.
reset role;

insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by, created_at)
values ((select alfa from qui), null, 'avis', -200, 'curs passat',
        (select junta from qui), now() - interval '400 days');

insert into public.avisos (user_id, tipus, gravetat, nota, points_log_id, created_by, created_at)
select (select alfa from qui), 'greu', 3, 'curs passat',
       (select id from public.points_log where nota = 'curs passat'),
       (select junta from qui), now() - interval '400 days';

insert into fet (clau, id)
select 'vell', id from public.avisos where nota = 'curs passat';

-- El control: abans de retirar res, el sostre d'aquest curs esta sencer i no hi
-- cap una resta de mes de 200.
reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'greu', 'mes que el sostre', -201, null) $$, (select alfa from qui)),
  '22023', 'sostre de punts del curs',
  'de sortida, el sostre d''aquest curs es exactament el que diu point_values'
);

-- ── es retira l'avis del curs passat ───────────────────────────────────────
-- La compensacio va amb `now()`: cau DINS la finestra d'aquest curs.
select lives_ok(
  format($$ select public.retira_avis(%L, 'error nostre, de l''any passat') $$,
         (select id from fet where clau='vell')),
  'la junta retira un avis del curs passat, que es una accio normal'
);

reset role;

select is(
  (select coalesce(sum(pl.puntos),0)::int
     from public.points_log pl
    where pl.user_id = (select alfa from qui)
      and pl.motivo in ('avis','avis_retirat')
      and pl.created_at >= (select des_de from private.periode_curs())),
  200,
  'i el saldo d''avisos DINS d''aquest curs passa a +200, punts que aquest curs no ha gastat mai'
);

-- ── i el sostre d'aquest curs NO s'ha mogut ────────────────────────────────
-- AQUESTA ASSERCIO S'HA INVERTIT, i es l'unic que s'ha tocat d'aquest fitxer.
-- Tal com es va escriure afirmava el comportament d'aquell dia: que una resta
-- de -400 hi passava amb el sostre escrit a 200, perque la compensacio d'un
-- avis d'un altre curs havia obert marge en aquest. El capcal ja deia que el
-- fitxer no afirmava quin dels dos comportaments era el correcte, nomes quin
-- era el d'avui.
--
-- La migracio 78 decideix quin es el correcte: el sostre compta cada moviment
-- pel curs de l'AVIS que l'explica, no pel de la seva propia data. Amb aixo, ni
-- el -200 del curs passat ni el seu +200 d'avui son d'aquest curs, el gastat
-- d'aquest curs continua sent 0, i una resta de -400 passa del sostre de 200 i
-- peta amb el mateix 22023 que ja petava a l'asercio 1.
--
-- Les altres tres no canvien de sentit. La 3 segueix dient +200 a posta: la
-- compensatoria s'escriu amb `now()` i continua caient-hi dins, que es el fet
-- que feia el forat. El que ha canviat es que `avisa()` ja no la compta com a
-- marge d'aquest curs.
reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'greu', 'i ara hi caben el doble', -400, null) $$,
         (select alfa from qui)),
  '22023', 'sostre de punts del curs',
  'i una resta de 400 continua petant amb el sostre escrit a 200: la compensacio d''un altre curs no obre marge en aquest'
);

select * from finish();
rollback;

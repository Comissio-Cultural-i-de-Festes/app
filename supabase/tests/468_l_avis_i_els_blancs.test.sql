-- Un avis amb un tabulador per motiu no es un avis.
--
-- ON VA AIXO: al costat de `465_avisos.test.sql`, que ja mira la nota buida i
-- la nota nula. Es un fitxer a part perque aquella prova no es meva i el forat
-- s'ha de poder veure caure sol.
--
-- EL FORAT, I DE QUI ES. La migracio 77 va escriure `private.nota_neta` i va
-- enumerar per escrit les cinc copies equivocades de la regla del blanc que hi
-- havia al repositori: `award_points`, `admin_decide_proposal`, **`avisa`**,
-- l'acta i l'etiqueta d'`avis_tipus`. En va corregir una, la seva. La 78 va
-- reescriure `avisa()` L'ENDEMA —per un motiu que no te res a veure, el sostre
-- del curs— i es va endur cap endavant el `length(btrim(coalesce(p_nota,'')))
-- = 0` d'un sol argument. `btrim(text)` treu U+0020 i prou: ni el tabulador,
-- ni l'espai dur, ni l'espai ideografic, ni la marca d'ordre de bytes.
--
-- PER QUE IMPORTA. La nota es la meitat del que fa que un avis sigui un avis i
-- no una resta muda: la persona la llegeix al seu perfil amb el motiu escrit, i
-- el formulari de la junta l'hi promet abans de desar. Amb un tabulador per
-- nota, `avisa()` escriu la fila d'`avisos` i la de `points_log`, i al perfil
-- del soci surt «Avis · −5» amb el per que en blanc. El formulari no hi arriba
-- —`String.prototype.trim()` de JavaScript si que treu el tabulador— pero
-- `avisa()` te el grant per a `authenticated` sencer i es crida amb curl.
--
-- LA REGLA NO ES TORNA A ESCRIURE: la 81 crida `private.nota_neta`, que es per
-- a aixo que existeix.
--
-- Gent i fets inventats, com a tot el repo.

begin;
select plan(8);

reset role;

delete from public.avisos;
delete from public.points_log;

-- Que la finestra del curs cobreixi avui: la resta de l'ultima asercio ha de
-- poder passar pel sostre, que es cosa de `467`.
update public.ranking_periods
   set starts_at = now() - interval '10 days',
       ends_at   = null
 where mena = 'global';

update public.point_values set punts = 500 where mena = 'avisos' and clau = 'sostre_curs';

create temporary table qui as select tests.uid('alfa') as alfa;
grant select on qui to authenticated;

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  format($$ select public.avisa(%L, 'greu', %L, -5, null) $$,
         (select alfa from qui), E'\t'),
  '22023', 'un avis sense motiu escrit no es un avis',
  'un tabulador no es un motiu'
);

select throws_ok(
  format($$ select public.avisa(%L, 'greu', %L, -5, null) $$,
         (select alfa from qui), chr(160)),
  '22023', 'un avis sense motiu escrit no es un avis',
  'ni l''espai dur, que es el que queda enganxat copiant d''un processador de textos'
);

select throws_ok(
  format($$ select public.avisa(%L, 'greu', %L, -5, null) $$,
         (select alfa from qui), chr(12288)),
  '22023', 'un avis sense motiu escrit no es un avis',
  'ni l''espai ideografic'
);

select throws_ok(
  format($$ select public.avisa(%L, 'greu', %L, -5, null) $$,
         (select alfa from qui), chr(65279)),
  '22023', 'un avis sense motiu escrit no es un avis',
  'ni la marca d''ordre de bytes, que es una nota que no es veu'
);

select throws_ok(
  format($$ select public.avisa(%L, 'greu', %L, -5, null) $$,
         (select alfa from qui), E' \t\r\n' || chr(160) || chr(12288) || chr(65279)),
  '22023', 'un avis sense motiu escrit no es un avis',
  'ni tots junts'
);

-- La meitat que importa: cap dels cinc no ha deixat res escrit.
reset role;

select is_empty(
  format($$ select 1 from public.avisos where user_id = %L $$, (select alfa from qui)),
  'i no n''ha quedat cap avis escrit amb el per que en blanc'
);

select is_empty(
  format($$ select 1 from public.points_log
             where user_id = %L and motivo = 'avis' $$, (select alfa from qui)),
  'ni cap fila de punts que la persona no pugui llegir per que li han restat'
);

-- I la verja no es una porta tancada: un motiu de debo continua passant, i els
-- blancs dels extrems se'n van sense endur-se el text.
reset role;
select tests.authenticate_as('junta_alfa');

select public.avisa(
  (select alfa from qui), 'greu',
  chr(65279) || E'\t' || 'No va venir al muntatge' || chr(160), -5, null
);

reset role;

-- `limit 1` amb un ordre: amb la 81 posada aquesta taula te exactament una
-- fila, i sense ella en te sis. Una subconsulta que peta amb «more than one
-- row» no diu que ha fallat, diu que s'ha trencat.
select is(
  (select a.nota from public.avisos a
    where a.user_id = (select alfa from qui)
    order by a.created_at desc, a.id desc
    limit 1),
  'No va venir al muntatge',
  'un motiu escrit passa, i arriba sense els blancs que el voltaven'
);

select * from finish();
rollback;

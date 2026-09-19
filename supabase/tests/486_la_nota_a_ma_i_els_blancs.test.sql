-- Una nota que només són blancs continua sent una nota buida: els quatre d'ASCII.
--
-- ON VA AIXÒ: dins de `460_l_ajust_a_ma_va_amb_nota.test.sql`, al costat de les
-- dues primeres assercions. És un fitxer a part només perquè aquella prova no
-- és meva i el forat s'ha de poder veure caure sol.
--
-- EL FORAT QUE VA OBRIR AQUEST FITXER. La migració 72 escrivia
-- `nullif(btrim(coalesce(p_nota, '')), '')` i el seu comentari deia que «una
-- nota de tres espais és una nota buida amb una altra cara». `btrim(text)` amb
-- UN sol argument treu només U+0020: ni tabulador, ni retorn de carro, ni salt
-- de línia, ni espai dur. La prova de la 460 només mirava `null` i `'   '`, i
-- per això passava. Amb un sol tabulador, un admin que no és l'owner restava
-- 500 punts per crida i la fila del llibre major i la del registre sortien amb
-- el «per què» en blanc.
--
-- ── QUÈ PROVA AQUEST FITXER I QUÈ NO ────────────────────────────────────────
--
-- AIXÒ NO ÉS LA VERJA DE LA REGLA, i dir-ho aquí val més que descobrir-ho un
-- altre cop. Les quatre entrades d'aquest fitxer són d'ASCII, i per tant passen
-- verdes tant amb la regla que hi ha desplegada —`private.nota_neta`, migració
-- 77— com amb la que aquella migració DESCARTA pel seu nom,
-- `btrim(coalesce(p_nota, ''), E' \t\r\n')`. Comprovat substituint la funció
-- dins d'una transacció: les cinc assercions verdes i, al mateix temps, un
-- admin que no és owner restant 500 punts amb una marca d'ordre de bytes per
-- nota. Un fitxer que no distingeix l'arreglament desplegat del que s'ha
-- descartat no és el que el fixa.
--
-- QUI SÍ QUE EL FIXA: `489_els_blancs_que_la_486_no_mira.test.sql`, que hi posa
-- els blancs d'Unicode —l'espai dur, l'ideogràfic, l'espai d'amplada zero i la
-- marca d'ordre de bytes— i cau amb la versió descartada. Aquest fitxer es
-- queda perquè els quatre casos d'ASCII són la regressió més barata i més
-- probable de totes, i perquè és el que documenta d'on venia; la llista llarga
-- viu en un sol lloc i no en dos que es puguin desincronitzar.
--
-- I PER QUÈ L'ÚLTIMA ASSERCIÓ JA NO DIU `\S`. Deia `nota !~ '\S'`, que en
-- aquesta base no veu ni U+FEFF ni U+200B —tots dos satisfan `\S`—: una fila
-- amb una marca d'ordre de bytes per nota hi hauria passat per davant sense que
-- la consulta la trobés. Ara es mira el que de debò es vol saber, que és que
-- cap de les quatre crides no hagi deixat fila.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(5);

reset role;
select tests.authenticate_as('junta_alfa');

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, E'\t') $$,
  '22023',
  'un ajust a ma vol una nota',
  'un tabulador tampoc es una nota'
);

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, E'\n') $$,
  '22023',
  'un ajust a ma vol una nota',
  'ni un salt de linia'
);

select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', 20, E' \t\r\n ') $$,
  '22023',
  'un ajust a ma vol una nota',
  'ni els quatre blancs junts'
);

-- I la meitat que importa: el negatiu dels admins depen d'aquesta nota.
select throws_ok(
  $$ select public.award_points(
       '00000000-0000-4000-8000-000000000001',
       null, 'manual', -500, E'\t') $$,
  '22023',
  'un ajust a ma vol una nota',
  'i sense nota un admin no pot restar, que es tota la rao per la qual pot restar'
);

-- Les files d'aquesta transaccio i no les de la taula: la llavor porta una fila
-- `manual` sense nota d'abans de la 72, i una prova que mires tot l'historic
-- diria que el forat hi es cada vegada que s'executa.
reset role;
select is_empty(
  $$ select 1 from public.points_log
      where motivo = 'manual'
        and user_id = '00000000-0000-4000-8000-000000000001'
        and created_at >= transaction_timestamp() $$,
  'i cap de les quatre crides no ha deixat fila'
);

select * from finish();
rollback;

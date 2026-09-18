-- Una nota que només són blancs continua sent una nota buida.
--
-- ON VA AIXÒ: dins de `460_l_ajust_a_ma_va_amb_nota.test.sql`, al costat de les
-- dues primeres assercions. És un fitxer a part només perquè aquella prova no
-- és meva i el forat s'ha de poder veure caure sol.
--
-- EL FORAT. La migració 72 escriu
-- `nullif(btrim(coalesce(p_nota, '')), '')` i el seu comentari diu «es comprova
-- amb `btrim` perquè una nota de tres espais és una nota buida amb una altra
-- cara». `btrim(text)` amb UN sol argument treu només U+0020: ni tabulador, ni
-- retorn de carro, ni salt de línia, ni espai dur. La prova de la 460 només
-- mira `null` i `'   '`, i per això passa.
--
-- PER QUÈ IMPORTA MÉS QUE UN CAMP LLEIG. La nota obligatòria no és cosmètica:
-- és l'única condició que la mateixa migració posa per obrir el negatiu als
-- admins («una resta per `manual` no pot existir sense nota i sense fila al
-- registre»). Amb un sol tabulador, un admin que no és l'owner resta 500 punts
-- per crida sense escriure res, i la fila del llibre major i la del registre
-- surten amb el «per què» en blanc. El formulari no hi arriba —`String.trim()`
-- de JavaScript sí que treu els tabuladors—, però la RPC té el grant per a
-- `authenticated` sencer i es crida des de la consola.
--
-- COM ES TAPA: `btrim(coalesce(p_nota, ''), E' \t\r\n')`, o millor
-- `case when p_nota ~ '\S' then btrim(p_nota) end`, que no deixa cap blanc de
-- Unicode fora. Aquesta prova ha de passar a ser verda amb el canvi.
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

reset role;
select is_empty(
  $$ select 1 from public.points_log
      where motivo = 'manual'
        and user_id = '00000000-0000-4000-8000-000000000001'
        and nota !~ '\S' $$,
  'no ha quedat cap fila manual amb la nota en blanc'
);

select * from finish();
rollback;

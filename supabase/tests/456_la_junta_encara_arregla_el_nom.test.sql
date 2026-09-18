-- L'altra meitat del 455: què NO s'endú la tanca de la 77.
--
-- El 455 diu que la junta no escriu l'Instagram d'un altre soci. Sol, això
-- passaria igual amb una tanca massa ampla —treure'ls l'UPDATE sobre la fila
-- d'un altre, o fer petar la sentència sencera— i les dues es menjarien la raó
-- per la qual `profiles_update_admin` existeix: que la junta pugui corregir un
-- nom mal escrit. Una prova que només mira el que ha de fallar deixa passar
-- una tanca que ho falla tot.
--
-- LA SEGONA ASSERCIÓ ÉS LA DECISIÓ DE LA 77 FETA EXECUTABLE. La 77 fixa el
-- valor vell en comptes de petar, i el que això vol dir és exactament això: en
-- una sola sentència amb el nom i l'Instagram, el nom arriba i l'Instagram no
-- es mou. Amb un `raise` hi hauria zero canvis i aquesta prova seria vermella;
-- per això va aquí i no al 455, que és d'ell.
--
-- Persones inventades, com a tot el repo.

begin;
select plan(3);

-- El que hi havia, capturat i no donat per fet: la suite de RLS escriu en
-- aquesta mateixa base i no desfà res.
create temp table abans as
select nombre, instagram from public.profiles
 where id = '00000000-0000-4000-8000-000000000001';
grant select on abans to authenticated;

reset role;
select tests.authenticate_as('junta_alfa');

update public.profiles
   set nombre = 'Alfa Ben Escrit', instagram = 'compte_que_no_es_seu'
 where id = '00000000-0000-4000-8000-000000000001';

select is(
  (select nombre from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'),
  'Alfa Ben Escrit',
  'la junta encara arregla un nom mal escrit, que es per a aixo que hi es'
);

select is(
  (select instagram from public.profiles
    where id = '00000000-0000-4000-8000-000000000001'),
  (select instagram from abans),
  'i a la mateixa sentencia cau nomes l''instagram, no la sentencia sencera'
);

-- I el seu, que és seu: la tanca mira de qui és la fila, no quin paper té qui
-- escriu. Una junta que no es pogués posar el propi Instagram voldria dir que
-- la regla s'ha escrit sobre el rol en comptes de sobre la propietat.
update public.profiles set instagram = 'junta_alfa_2026'
 where id = (select auth.uid());

select is(
  (select instagram from public.profiles where id = (select auth.uid())),
  'junta_alfa_2026',
  'i el seu propi si que se''l posa'
);

select * from finish();
rollback;

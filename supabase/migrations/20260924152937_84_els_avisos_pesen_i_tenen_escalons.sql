-- Els avisos pesen, i el que pesen té tres escalons.
--
-- EL QUE HI HAVIA. La 73 va deixar un sol número, `avisos.llindar`, que
-- comparava la SUMA DE GRAVETATS del curs amb un enter: amb 4, dues greus
-- marcaven la fitxa, i quatre lleus també. Era una marca i prou —«Per mirar»—,
-- sense dir què s'havia de mirar ni què venia després.
--
-- EL QUE LA JUNTA HA ACORDAT és una normativa de dues peces:
--
--   PESOS. Cada gravetat val un nombre de punts d'avís: lleu 1, greu 2, molt
--   greu 4. La molt greu en val quatre i no tres a posta: una sola ha de posar
--   algú a risc, que és el que vol dir «molt greu», i amb un 3 caldria una
--   lleu més per arribar-hi.
--
--   ESCALONS. Tres llindars sobre la suma: avís (2), risc (4) i expulsió (6).
--   L'últim NO expulsa ningú: marca la fitxa amb «Expulsió a votació», i la
--   junta la vota a la reunió següent. L'app no pren cap decisió, en registra
--   les condicions.
--
-- ON VIUEN: A `point_values`, al costat del sostre. La 73 ja va pagar el preu
-- de fer que `mena = 'avisos'` voldria dir «número que la junta mou sense
-- desplegar», i sis enters més no canvien aquell raonament: `/junta/barem`
-- ja els pinta, `admin_set_point_value` ja els desa i els audita, i el rang
-- de la taula (0..500) ja fita el que val la pena fitar.
--
-- L'OPCIÓ DESCARTADA: una taula `normativa_avisos` amb una fila per escaló i
-- una columna per pes. Hauria permès un CHECK `risc > avis`, que aquí no hi
-- és. Costava una taula, una política, uns grants, una RPC i un bloc de
-- pantalla nous per guardar sis enters, i el CHECK hauria impedit un estat
-- que la junta pot voler de debò —apagar l'escaló del mig posant-lo a 0—. Qui
-- decideix com es llegeixen els escalons és `estatDe()` al client: de dalt a
-- baix, el més alt que està encès i s'ha assolit.
--
-- ZERO APAGA, com el sostre i com l'antic llindar. Un llindar a 0 vol dir que
-- aquell escaló no existeix. Un PES a 0 vol dir que aquella gravetat no suma,
-- que és una normativa estranya però no una incoherent.
--
-- `avisos.llindar` ES TREU, no es deixa orfe. Una fila que ningú no llegeix
-- però que surt a `/junta/barem` amb un camp editable és exactament el defecte
-- que el llindar va tenir durant una setmana a la 73: un número que es pot
-- moure sense que passi res.
--
-- CAP FIRMA NI CAP CHECK NO CANVIA. `gravetat` continua sent 1..3 a
-- `avis_tipus` i a `avisos`; el que canvia és què val cadascuna.

delete from public.point_values where mena = 'avisos' and clau = 'llindar';

-- `on conflict do nothing` perquè tornar a passar les migracions no desfaci un
-- número que la junta hagi mogut. L'ordre deixa el sostre al final: els pesos i
-- els escalons es llegeixen junts, i el sostre és una altra pregunta.
insert into public.point_values (mena, clau, punts, ordre) values
  ('avisos', 'pes_lleu',          1, 1),
  ('avisos', 'pes_greu',          2, 2),
  ('avisos', 'pes_molt_greu',     4, 3),
  ('avisos', 'llindar_avis',      2, 4),
  ('avisos', 'llindar_risc',      4, 5),
  ('avisos', 'llindar_expulsio',  6, 6)
on conflict (mena, clau) do nothing;

update public.point_values set ordre = 7 where mena = 'avisos' and clau = 'sostre_curs';

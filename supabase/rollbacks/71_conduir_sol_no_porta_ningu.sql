-- Rollback de la migració 71. NO és a `migrations/` a posta: un fitxer aquí
-- dins el desfaria el mateix `db push` que acaba d'aplicar-lo.
--
-- Torna els dos botons de cotxe: `conduir` a 25 i `trajo_gente` a 15, amb
-- l'ordre 1–4 de la llavor de la 15. A partir d'aquí la pantalla de donar punts
-- torna a dibuixar quatre botons i la mateixa nit es pot tornar a pagar 25 a
-- qui hi va anar sol o 40 a qui va portar gent, que és exactament el que la 71
-- tancava. Es desfà sencer o no es desfà.
--
-- LA 76 VA PRIMER. Ella torna `conduir` a l'allowlist d'`award_points`; si això
-- s'executés abans, hi hauria un moment amb el botó dibuixat i la RPC
-- refusant-lo amb 22023 a qui el premés. L'ordre és 76 i després 71.
--
-- I NO HI HA CAP ALTRA DEPENDÈNCIA. Aquest fitxer no reescriu cap funció —només
-- toca files de `point_values`— o sigui que no pot desfer en silenci cap
-- migració posterior, que és el defecte que el rollback de la 76 va portar una
-- temporada. `tests/rollbacks-cos-al-dia.test.ts` ho comprova per a tot el
-- directori.
--
-- EL QUE AQUEST FITXER NO POT TORNAR, i és l'única part que perd informació:
-- els punts que la junta hi hagués posat. La 71 fa un `delete` de la fila de
-- `conduir` —o sigui que el seu valor ja no existeix enlloc— i un `update`
-- incondicional sobre `trajo_gente`. Aquí es reposen els números de la llavor
-- de la 15, 25 i 15, que són els únics que se saben. Si a producció la junta
-- havia tocat cap dels dos abans de la 71, el que torna no és el que hi havia i
-- s'ha de mirar el registre: `admin_set_point_value` deixa una fila a
-- `audit_log` amb `accio = 'set_point_value'` i el valor d'abans al detall.
--
-- Les files de `points_log` no es toquen. El CHECK sempre ha acceptat les dues
-- claus i la 71 no en va reescriure cap: l'històric ja era correcte abans i ho
-- continua sent després.

-- ── la fila que torna ───────────────────────────────────────────────────────
-- `on conflict do update` i no un `insert` pelat perquè això s'ha de poder
-- executar dues vegades sense petar: un rollback a mitges que es reprèn és
-- precisament el cas en què algú el torna a llançar.
insert into public.point_values (mena, clau, punts, ordre)
values ('motiu', 'conduir', 25, 2)
on conflict (mena, clau) do update
  set punts = excluded.punts, ordre = excluded.ordre;

-- ── i els dos ordres que la 71 va renumerar ─────────────────────────────────
-- Només `ordre` per a `propuso`: la 71 no li va tocar els punts, i a producció
-- la junta sí. Escriure-hi un `punts` aquí se'ls carregaria.
update public.point_values
   set punts = 15, ordre = 3
 where mena = 'motiu' and clau = 'trajo_gente';

update public.point_values
   set ordre = 4
 where mena = 'motiu' and clau = 'propuso';

-- Un avís posat un curs i retirat el següent torna a sortir al panell com una
-- font de punts guanyats.
--
-- AQUEST FITXER NEIX VERMELL I ES QUEDA VERMELL. No prova cap regla que la
-- base compleixi avui: prova la que la migració 80 diu que compleix. Es deixa
-- escrit i en vermell pel mateix criteri que el 485, que també va néixer així:
-- un forat demostrat val més que un forat descrit. Qui el tanqui el posarà
-- verd sense tocar cap asserció; si n'ha de tocar cap, el que ha canviat és la
-- promesa i no el codi.
--
-- QUÈ PROMET LA 80. La seva capçalera ho diu dues vegades, i la segona dins del
-- cos de la funció: «`avis_retirat` NO ÉS UN MOTIU D'AQUESTA LLISTA: s'agrupa
-- sota `avis` (...). Separats, la retirada d'un càstig quedaria dibuixada com
-- una font de punts guanyats». L'agrupació tanca el cas que el 485 exercita
-- —les dues files dins de la mateixa finestra, que es neutralitzen— i no en
-- tanca cap altre.
--
-- QUÈ PASSA QUAN NO HI CAUEN LES DUES. `admin_dashboard` filtra per
-- `l.created_at`, i les dues files d'un avís retirat no comparteixen data: la
-- 78 explica que `retira_avis()` escriu la compensatòria amb `now()`, que una
-- fila d'`avisos` no caduca mai i que el botó «Retira l'avís» surt a totes les
-- files vives de la fitxa. La 78 ho classifica ella mateixa: retirar un avís
-- d'un curs anterior és «una acció normal, no un cas rar».
--
-- Quan la junta mira el curs on hi ha la RETIRADA i no l'avís, el grup `avis`
-- del període conté només la fila positiva. La suma surt +N, i el signe és
-- l'únic que `DashboardScreen.tsx` mira per decidir què va al gràfic
-- (`punts > 0` → barra; `punts <= 0` → la línia de sota). O sigui que la fila
-- entra al gràfic de «d'on surten els punts» com una font més, competint amb
-- muntatge i amb venir, que és exactament el que la 80 volia impedir.
--
-- I `VEGADES` HO CONTRADIU DINS DE LA MATEIXA FILA. El `count` de la 80 filtra
-- `motivo <> 'avis_retirat'` perquè el número segueixi sent «quants avisos
-- s'han posat». En aquesta finestra no se n'ha posat cap, o sigui que la fila
-- surt amb `punts` positius i `vegades` a zero: el panell diu alhora que els
-- avisos han donat punts i que no n'hi ha hagut cap.
--
-- PER QUÈ NO N'HI HA PROU AMB AGRUPAR. El que fa que un avís i la seva
-- retirada es cancel·lin no és el motiu, és la PARELLA, i la parella la
-- guarda `avisos` (`points_log_id` i `retirat_points_log_id`) — que és per on
-- la 78 va ancorar el sostre del curs quan va topar amb aquest mateix
-- desajust de dates. El panell encara agrupa per motiu i talla per data de
-- fila, que són dues decisions independents i no poden veure la parella.
--
-- Persones i esdeveniments inventats, com a tot el repositori. La finestra és
-- al futur a posta: l'stack local és compartit i així cap fila de ningú més hi
-- pot caure.

begin;
select plan(3);

reset role;

-- Un avís del curs 2027-28 que la junta retira al curs 2028-29. Cap altra fila
-- no cau dins de cap de les dues finestres.
insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by, created_at)
values
  ('00000000-0000-4000-8000-000000000002', null, 'avis', -25,
   'va deixar la sala oberta', '00000000-0000-4000-8000-0000000000a1',
   '2028-03-10T20:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', null, 'avis_retirat', 25,
   'error nostre, si que havia avisat', '00000000-0000-4000-8000-0000000000a1',
   '2028-11-15T20:00:00Z'),
  ('00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-0000000000e1', 'asistencia', 30, null,
   '00000000-0000-4000-8000-0000000000a1', '2028-11-16T20:00:00Z');

reset role;
select tests.authenticate_as('junta_alfa');

-- El curs de la RETIRADA: hi ha la compensatòria i no l'avís que la explica.
create temp table curs_de_la_retirada as
select jsonb_array_elements(
         public.admin_dashboard('2028-09-01T00:00:00Z', '2029-07-01T00:00:00Z')
         -> 'punts_per_motiu') as r;
grant select on curs_de_la_retirada to authenticated;

-- ── el que el panell hauria de dir ──────────────────────────────────────────

select ok(
  coalesce(
    (select (r->>'punts')::int from curs_de_la_retirada where r->>'motivo' = 'avis'),
    0) <= 0,
  'cap avís no pot sumar punts al panell: retirar-ne un no és guanyar-ne'
);

-- El criteri del gràfic és el signe i res més: `DashboardScreen.tsx` parteix
-- la llista amb `punts > 0` i el que passa el tall es dibuixa com una barra al
-- costat de muntatge i de venir. Dit en els termes de la pantalla: cap barra
-- del gràfic no pot ser un avís.
select is(
  (select count(*)::int from curs_de_la_retirada
    where r->>'motivo' = 'avis' and (r->>'punts')::int > 0),
  0,
  'i per tant cap avís no arriba a ser una barra del gràfic de la pantalla'
);

-- Una fila que diu «+25 punts» i «0 avisos» alhora no és llegible de cap
-- manera. Si la fila hi ha de ser amb el seu signe, el seu compte l''ha
-- d''acompanyar.
select ok(
  not exists (
    select 1 from curs_de_la_retirada
     where r->>'motivo' = 'avis'
       and (r->>'punts')::int <> 0
       and (r->>'vegades')::int = 0),
  'cap fila no diu que hi ha hagut punts per un motiu del qual no hi ha hagut cap cas'
);

select * from finish();
rollback;

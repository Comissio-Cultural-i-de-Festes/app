-- «D'on surten els punts» del tauler comptava mitja columna del llibre major.
--
-- AQUEST FITXER VA NÉIXER VERMELL, a posta: no provava cap regla que la base
-- complís, sinó la que hauria de complir, i fallava. Es va deixar escrit i en
-- vermell perquè el forat quedés demostrat i no descrit. La migració 80 el
-- tanca i avui passa; cap asserció no s'ha tocat per aconseguir-ho, que és
-- l'única manera que una prova escrita abans de l'arreglament serveixi de res.
--
-- QUÈ PASSAVA. `admin_dashboard` muntava `punts_per_motiu` amb un
-- `where l.puntos > 0` (migració 48). Quan es va escriure, cap motiu no podia
-- ser negatiu i el filtre no treia res; la 73 va afegir `avis` (negatiu) i
-- `avis_retirat` (positiu, que el desfà) i, des d'aleshores, el filtre feia
-- dues coses alhora:
--
--   · amagava les files negatives senceres —els `avis` i els ajustos a mà que
--     resten—, o sigui que el motiu `avis` no sortia al panell ni existint;
--   · i deixava passar el seu `avis_retirat`, que és la RETIRADA d'un càstig,
--     pintada com si fos una font de punts guanyats.
--
-- Un avís posat i retirat suma zero al soci —el seu perfil ho fa bé— i al
-- panell sumava +25. El panell i el perfil explicaven dos cursos diferents.
--
-- PER QUÈ AQUÍ I NO A LA ISSUE #2. No en forma part: la #2 toca `conduir` i
-- l'escala. Però el llibre que aquest panell llegeix és el que la 71 i la 76
-- van tocar, i la revisió d'aquella feina és on s'ha vist. Queda escrit al
-- costat del 480 perquè és el mateix llibre.
--
-- Persones i esdeveniments inventats, com a tot el repo.

begin;
select plan(4);

reset role;
delete from public.points_log;
delete from public.audit_log;

-- Un vespre qualsevol: venir, i un avís que després es retira.
-- Els tres motius són els que la 73 va posar en joc.
insert into public.points_log (user_id, event_id, motivo, puntos, nota, granted_by)
values
  ('00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-0000000000e1', 'asistencia', 30, null,
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000002',
   null, 'avis', -25, 'va deixar la sala oberta',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000002',
   null, 'avis_retirat', 25, 'error nostre, si que havia avisat',
   '00000000-0000-4000-8000-0000000000a1');

-- El soci en té 30: l'avís i la seva retirada es neutralitzen.
select is(
  (select sum(puntos)::int from public.points_log
    where user_id = '00000000-0000-4000-8000-000000000002'),
  30,
  'al llibre major l''avís i la seva retirada sumen zero, i queden els 30 de venir'
);

reset role;
select tests.authenticate_as('junta_alfa');

create temp table tauler as
select jsonb_array_elements(public.admin_dashboard(null, null) -> 'punts_per_motiu') as r;
grant select on tauler to authenticated;

-- ── el que el panell hauria de dir ──────────────────────────────────────────

select is(
  (select sum((r->>'punts')::int)::int from tauler),
  30,
  'el total del panell és el del llibre: 30, i no 55'
);

select isnt_empty(
  $$ select 1 from tauler where r->>'motivo' = 'avis' $$,
  'el motiu `avis` surt al panell: una sanció és informació, no un forat'
);

select is(
  (select (r->>'punts')::int from tauler where r->>'motivo' = 'avis_retirat'),
  null,
  'i `avis_retirat` no es presenta com una font de punts guanyats'
);

-- ── ON VA ANAR L'ARREGLAMENT ────────────────────────────────────────────────
--
-- A `admin_dashboard`, al bloc `v_motius`, per la migració 80.
--
-- AQUEST PEU DEIA QUE ERA D'UNA LÍNIA I ES VA EQUIVOCAR, i val la pena deixar
-- escrit per què. Deia: que caigui el `where l.puntos > 0` i llestos, que
-- `avis` sortirà amb el seu signe i `avis_retirat` amb el seu. Les dues
-- primeres assercions passen així; la quarta no. Treure el filtre tapa el
-- primer dels dos símptomes que la capçalera enumera —les files negatives
-- amagades— i deixa el segon sencer: `avis_retirat` continua sent una fila
-- pròpia de +25 al gràfic de d'on surten els punts, que és exactament la
-- retirada d'un càstig pintada com a punts guanyats.
--
-- Per això la 80 fa les dues coses: treu el filtre i agrupa `avis_retirat`
-- sota `avis`. La fila `avis` passa a ser el net del període —un avís posat i
-- retirat és un 0 que existeix— i el total de la llista torna a ser el del
-- llibre major. Al perfil les dues línies segueixen separades, que és on la
-- 73 les volia i on la pregunta és una altra: què va passar i quan.
--
-- El percentatge de `DashboardScreen.tsx` era l'altra meitat: amb números
-- negatius al conjunt, `r.punts / totalPoints` deixa de ser una proporció i
-- una barra pot sortir negativa —i una amplada CSS negativa no encongeix la
-- barra, la descarta i la deixa al 100%—. La decisió és de producte i està
-- escrita allà: els motius que no sumen surten del gràfic i van a una línia de
-- text a sota.

select * from finish();
rollback;

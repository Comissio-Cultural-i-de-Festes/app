-- «D'on surten els punts» del tauler compta mitja columna del llibre major.
--
-- AQUEST FITXER ÉS VERMELL A POSTA. No prova cap regla que la base ja
-- compleixi: prova la que hauria de complir, i falla. Es deixa escrit i en
-- vermell perquè el forat quedi demostrat i no descrit — l'arreglament no és
-- d'aquesta feina i és d'una línia, que va anotada al final.
--
-- QUÈ PASSA. `admin_dashboard` munta `punts_per_motiu` amb un
-- `where l.puntos > 0` (migració 48). Quan es va escriure, cap motiu no podia
-- ser negatiu i el filtre no treia res; la 73 va afegir `avis` (negatiu) i
-- `avis_retirat` (positiu, que el desfà) i, des d'aleshores, el filtre fa dues
-- coses alhora:
--
--   · amaga les files negatives senceres —els `avis` i els ajustos a mà que
--     resten—, o sigui que el motiu `avis` no surt al panell ni existint;
--   · i deixa passar el seu `avis_retirat`, que és la RETIRADA d'un càstig,
--     pintada com si fos una font de punts guanyats.
--
-- Un avís posat i retirat suma zero al soci —el seu perfil ho fa bé— i al
-- panell suma +25. El panell i el perfil expliquen dos cursos diferents.
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

-- ── ON VA L'ARREGLAMENT ─────────────────────────────────────────────────────
--
-- A `admin_dashboard`, al bloc `v_motius`: el `where l.puntos > 0` ha de
-- caure. La suma per motiu ja és un `sum()`, o sigui que amb el filtre fora
-- `avis` surt amb el seu signe i `avis_retirat` amb el seu, i els dos es
-- veuen l'un al costat de l'altre, que és el que explica el vespre.
--
-- El percentatge de `DashboardScreen.tsx:249` és l'altra meitat: amb números
-- negatius al conjunt, `r.punts / totalPoints` deixa de ser una proporció i
-- una barra pot sortir negativa. La decisió de com es pinta una sanció —barra
-- cap a l'altra banda, secció a part, o fora del gràfic i en una línia de
-- text— és de producte i no d'aquest fitxer.
--
-- Com que canvia el cos d'una funció, va en una migració nova amb el seu
-- rollback, i la signatura no es toca: un paràmetre nou amb valor per defecte
-- crearia una sobrecàrrega i PostgREST contestaria PGRST203.

select * from finish();
rollback;

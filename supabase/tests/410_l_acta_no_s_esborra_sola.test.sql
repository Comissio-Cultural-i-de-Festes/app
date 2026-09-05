-- L'acta sobreviu a tornar a tancar la reunió.
--
-- LA MIGRACIÓ 62 separa tres casos que abans n'eren dos: `p_acta` absent no
-- toca res, buida esborra, amb text desa. Aquest fitxer prova els tres, i el
-- primer és el que hi ha hagut un defecte.
--
-- EL CAMÍ QUE ES DEFENSA és el de debò, no un d'inventat: la junta tanca la
-- reunió amb acta, hi torna a entrar per corregir una assistència —cosa que la
-- pantalla convida a fer— i prem «Tanca-la». Si la crida no porta acta, l'acta
-- s'ha de quedar. Abans desapareixia, i com que `events_public` la serveix als
-- socis, desapareixia per a tothom alhora.
--
-- El control positiu és la tercera meitat i sense ell això passaria igual amb
-- una acta que no es pogués esborrar mai: enviar-la buida SÍ que l'ha de
-- treure, perquè la pantalla ho promet («si la deixes en blanc, la reunió es
-- tanca igual i el bloc de l'acta no surt a ningú»).
--
-- EL REGISTRE ES COMPTA, NO S'ORDENA. `audit_log.created_at` és `now()`, que
-- dins d'una transacció és el mateix instant per a les quatre crides d'aquest
-- fitxer, i `id` és un uuid: no hi ha cap manera d'ordenar-les. Un
-- `order by created_at desc limit 1` agafaria una qualsevol i passaria per sort.
-- Per això les assercions del registre són recomptes de quantes en diuen que
-- no hi ha acta, que a més diu una cosa més forta: cap tancada n'ha perdut mai.
--
-- Reunions i persones inventades, com a tot el repo.

begin;
select plan(12);

reset role;

create temporary table quina as
select '00000000-0000-4000-8000-0000000000ac'::uuid as id;
grant select on quina to authenticated;

insert into public.events (id, tipo, abast, starts_at, puntos, published)
values ((select id from quina), 'reunio', 'junta', now() - interval '1 day', 0, true);

select tests.authenticate_as('junta_alfa');

-- ── 1. Es tanca amb acta, i s'hi desa ───────────────────────────────────────

select lives_ok(
  $$ select public.admin_close_meeting(
       (select id from quina),
       array['00000000-0000-4000-8000-0000000000a1'::uuid],
       'Acta inventada: dos punts i cap acord.') $$,
  'la junta tanca la reunio amb acta'
);

select is(
  (select acta from public.event_details where event_id = (select id from quina)),
  'Acta inventada: dos punts i cap acord.',
  'l''acta hi es'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'close_meeting' and target_id = (select id from quina)
      and (detall->>'amb_acta')::boolean),
  1,
  'i el registre diu que n''hi ha'
);

-- ── 2. Es torna a tancar SENSE acta: l'acta es queda ────────────────────────
--
-- Aquesta es la que fallava. La crida es la que fa el client quan algu nomes
-- ve a corregir qui hi era.

select lives_ok(
  $$ select public.admin_close_meeting(
       (select id from quina),
       array['00000000-0000-4000-8000-0000000000a1'::uuid,
             '00000000-0000-4000-8000-0000000000a2'::uuid]) $$,
  'i es torna a tancar corregint nomes una assistencia'
);

select is(
  (select acta from public.event_details where event_id = (select id from quina)),
  'Acta inventada: dos punts i cap acord.',
  'l''acta SEGUEIX. Aixo es el defecte que arregla la 62'
);

select is(
  (select count(*)::int from public.attendances
    where event_id = (select id from quina) and estado = 'asistio'),
  2,
  'i la correccio de l''assistencia si que ha entrat'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'close_meeting' and target_id = (select id from quina)
      and not (detall->>'amb_acta')::boolean),
  0,
  'i cap de les dues tancades consta com a haver-se quedat sense acta'
);

-- ── 3. Es torna a tancar amb una acta NOVA: la substitueix ──────────────────

select lives_ok(
  $$ select public.admin_close_meeting(
       (select id from quina),
       array['00000000-0000-4000-8000-0000000000a1'::uuid],
       'Acta corregida: tres punts.') $$,
  'i es pot reescriure'
);

select is(
  (select acta from public.event_details where event_id = (select id from quina)),
  'Acta corregida: tres punts.',
  'la nova substitueix la vella'
);

-- ── 4. El control positiu: buida SI que l''esborra ──────────────────────────
--
-- Sense aquest cas, les assercions de dalt passarien igual si l'acta fos
-- inesborrable, i la pantalla promet que deixar-la en blanc la treu.

select lives_ok(
  $$ select public.admin_close_meeting(
       (select id from quina),
       array['00000000-0000-4000-8000-0000000000a1'::uuid],
       '   ') $$,
  'tancar-la amb el quadre en blanc no peta'
);

select is(
  (select acta from public.event_details where event_id = (select id from quina)),
  null,
  'i aixo si que l''esborra, que es el que la pantalla promet'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'close_meeting' and target_id = (select id from quina)
      and not (detall->>'amb_acta')::boolean),
  1,
  'i ara, i nomes ara, n''hi ha una que diu que no en queda'
);

select * from finish();
rollback;

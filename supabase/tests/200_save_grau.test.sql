-- The degree list, and the rename that has to carry people with it.
--
-- `profiles.grau` stores the name as free text and not a reference, so a
-- rename that only touches this table leaves everybody who already picked the
-- degree on the old spelling — on the card the door reads — permanently, with
-- no constraint anywhere that would ever report it.

begin;
select plan(14);

reset role;
delete from public.audit_log;

create temporary table who as
select tests.uid('alfa') as alfa, tests.uid('bravo') as bravo;
grant select on who to authenticated;

-- Two people on a degree with the same name in two different schools. The
-- second is the one the rename must NOT touch.
insert into public.graus (escola, nom, ordre) values
  ('politecnica', 'Grau Provisional', 90),
  ('salut',       'Grau Provisional', 90);

update public.profiles set escola = 'politecnica', grau = 'Grau Provisional'
 where id = (select alfa from who);
update public.profiles set escola = 'salut', grau = 'Grau Provisional'
 where id = (select bravo from who);

-- ── who may ─────────────────────────────────────────────────────────────────
select tests.authenticate_as('bravo');

select throws_ok(
  $$ select public.admin_save_grau('salut', 'Grau inventat') $$,
  '42501',
  'nomes junta',
  'a member cannot add a degree'
);

select throws_ok(
  $$ select public.admin_delete_grau(
       (select id from public.graus where escola = 'salut' limit 1)) $$,
  '42501',
  'nomes junta',
  'nor take one away'
);

reset role;
select ok(
  not has_table_privilege('authenticated', 'public.graus', 'INSERT'),
  'and the direct path is gone: the grant, not the policy, is the lock'
);

-- ── adding ──────────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');
select public.admin_save_grau('empresa', '  Grau Nou  ', 42);

reset role;
select is(
  (select nom from public.graus where escola = 'empresa' and ordre = 42),
  'Grau Nou',
  'a new degree lands trimmed, because a trailing space is invisible in a list'
);

-- ── renaming, which is the reason this is an RPC ────────────────────────────
select tests.authenticate_as('junta_alfa');
select lives_ok(
  $$ select public.admin_save_grau(
       'politecnica', 'Grau Definitiu', 90,
       (select id from public.graus where escola = 'politecnica' and nom = 'Grau Provisional')) $$,
  'the junta can fix a name'
);

reset role;
select is(
  (select grau from public.profiles where id = (select alfa from who)),
  'Grau Definitiu',
  'and the people already on it come along, which no constraint would ever force'
);

select is(
  (select grau from public.profiles where id = (select bravo from who)),
  'Grau Provisional',
  'while the same words in another school are left alone'
);

select is(
  (select nom from public.graus where escola = 'salut' and ordre = 90),
  'Grau Provisional',
  'and so is that school''s row'
);

select is(
  (select detall->>'gent_reanomenada' from public.audit_log
    where accio = 'save_grau' and detall->>'abans' = 'Grau Provisional'),
  '1',
  'the trail counts who was carried, so a rename that moved nobody is visible'
);

-- ── deleting ────────────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');
select lives_ok(
  $$ select public.admin_delete_grau(
       (select id from public.graus where escola = 'politecnica' and nom = 'Grau Definitiu')) $$,
  'and can take one off the picker'
);

reset role;
select is_empty(
  $$ select 1 from public.graus where nom = 'Grau Definitiu' $$,
  'the row goes'
);

select is(
  (select grau from public.profiles where id = (select alfa from who)),
  'Grau Definitiu',
  'and the person keeps theirs: their answer is not a reference into this list'
);

select is(
  (select detall->>'nom' from public.audit_log where accio = 'delete_grau'),
  'Grau Definitiu',
  'with the name in the trail, so it can be put back'
);

select tests.authenticate_as('junta_alfa');
select throws_ok(
  $$ select public.admin_save_grau('salut', 'X') $$,
  '22023',
  null,
  'a one-letter name is refused here rather than by a constraint violation'
);

select * from finish();
rollback;

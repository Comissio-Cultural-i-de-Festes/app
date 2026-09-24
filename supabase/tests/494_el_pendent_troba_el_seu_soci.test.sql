-- L'enganxada automàtica: un avís pendent es converteix en avís quan hi ha
-- exactament un perfil actiu amb el mateix telèfon.
--
-- ELS CASOS SÓN ELS DEL DIA A DIA, un per bloc:
--   · el perfil encara és `pendent` quan desa el telèfon, i s'enganxa en fer-se
--     actiu, amb la data de la falta;
--   · dos perfils actius amb el mateix número: ambigu, i es desfà quan un marxa;
--   · un duplicat en `baixa` no fa ambigu res;
--   · el telèfon canviat més tard també enganxa;
--   · el sostre del curs deixa el pendent esperant, amb el motiu;
--   · UN PENDENT QUE PETA NO IMPEDEIX DESAR EL TELÈFON, i els altres del mateix
--     número s'enganxen igualment;
--   · el soci que ho dispara no veu cap pendent.
--
-- Les persones són noves i es creen aquí, amb ids i números inventats. Els
-- números comencen per 9: no són mòbils i el CI no els confon amb dades reals.

begin;
select plan(24);

reset role;
update public.ranking_periods
   set starts_at = now() - interval '30 days', ends_at = null
 where mena = 'global';
update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

select tests.create_user('pend_nou',   '00000000-0000-4000-8000-0000000e0001', 'member', 'pendent');
select tests.create_user('pend_ab',    '00000000-0000-4000-8000-0000000e0002', 'member', 'actiu');
select tests.create_user('pend_ba',    '00000000-0000-4000-8000-0000000e0003', 'member', 'actiu');
select tests.create_user('pend_bx',    '00000000-0000-4000-8000-0000000e0004', 'member', 'baixa');
select tests.create_user('pend_ok',    '00000000-0000-4000-8000-0000000e0005', 'member', 'actiu');
select tests.create_user('pend_canvi', '00000000-0000-4000-8000-0000000e0006', 'member', 'actiu');
select tests.create_user('pend_sost',  '00000000-0000-4000-8000-0000000e0007', 'member', 'actiu');
select tests.create_user('pend_peta',  '00000000-0000-4000-8000-0000000e0008', 'member', 'actiu');

create temporary table fet (clau text primary key, id uuid);
grant select, insert, update on fet to authenticated;

-- ── els pendents ───────────────────────────────────────────────────────────
select tests.authenticate_as('junta_alfa');

insert into fet select 'nou', public.crea_avis_pendent(
  'Persona Nova', '912 34 56 01', now() - interval '10 days',
  'no_va_venir', 'Prova: no va venir', -10, null, 'Trucada feta');
insert into fet select 'ambigu', public.crea_avis_pendent(
  'Persona Ambigua', '912 34 56 02', now() - interval '5 days', 'mal_gest', 'Prova: ambigu');
insert into fet select 'baixa', public.crea_avis_pendent(
  'Persona Duplicada', '912 34 56 04', now() - interval '5 days', 'mal_gest', 'Prova: baixa');
insert into fet select 'canvi', public.crea_avis_pendent(
  'Persona Canvia', '912 34 56 06', now() - interval '5 days', 'mal_gest', 'Prova: canvi');
insert into fet select 'sostre', public.crea_avis_pendent(
  'Persona Sostre', '912 34 56 07', now() - interval '5 days', 'no_va_venir', 'Prova: sostre', -10);
insert into fet select 'peta', public.crea_avis_pendent(
  'Persona Peta', '912 34 56 08', now() - interval '6 days', 'mal_gest', 'Prova: peta aquest');
insert into fet select 'no_peta', public.crea_avis_pendent(
  'Persona Peta', '912 34 56 08', now() - interval '5 days', 'mal_gest', 'Prova: aquest no');

reset role;

-- ── 1. pendent i després actiu ─────────────────────────────────────────────
-- El soci acaba l'onboarding abans que la invitació el faci actiu.
select tests.authenticate_as('pend_nou');
select lives_ok(
  $$ update public.profile_contact set telefon = '+34912345601' where id = auth.uid() $$,
  'un perfil pendent desa el telèfon sense cap problema'
);

reset role;
select is(
  (select enllacat_at is null from public.avisos_pendents where id = (select id from fet where clau = 'nou')),
  true,
  'mentre el perfil és pendent, no s''enganxa'
);

-- Com ho fa `redeem_invite()`: l'estat canvia i el disparador ho veu.
update public.profiles set estat = 'actiu' where id = '00000000-0000-4000-8000-0000000e0001';

select is(
  (select p.enllacat_via || '|' || a.user_id::text || '|' || (a.created_at = p.falta_at)::text
     from public.avisos_pendents p join public.avisos a on a.id = p.avis_id
    where p.id = (select id from fet where clau = 'nou')),
  'telefon|00000000-0000-4000-8000-0000000e0001|true',
  'en fer-se actiu, s''enganxa pel telèfon, amb la data de la falta'
);

select is(
  (select pl.puntos || '|' || (pl.created_at = a.created_at)::text
     from public.avisos_pendents p
     join public.avisos a on a.id = p.avis_id
     join public.points_log pl on pl.id = a.points_log_id
    where p.id = (select id from fet where clau = 'nou')),
  '-10|true',
  'i els punts es resten amb la data de la falta, que és la que llegeix el rànquing'
);

select is(
  (select a.nota || '|' || a.mesura_presa from public.avisos_pendents p join public.avisos a on a.id = p.avis_id
    where p.id = (select id from fet where clau = 'nou')),
  'Prova: no va venir|Trucada feta',
  'amb la nota i la mesura presa, que el soci llegirà al seu perfil'
);

select is(
  (select coalesce(telefon, '∅') from public.avisos_pendents where id = (select id from fet where clau = 'nou')),
  '∅',
  'i el telèfon del pendent se''n va'
);

select is(
  (select count(*)::int from public.audit_log
    where accio = 'avis' and detall->>'pendent' = (select id::text from fet where clau = 'nou')
      and detall->>'via' = 'telefon' and actor_id = tests.uid('junta_alfa')),
  1,
  'la mateixa auditoria que avisa(), amb el creador del pendent com a autor'
);

-- El soci que ho ha disparat veu el seu avís i cap pendent.
select tests.authenticate_as('pend_nou');
select is(
  (select count(*)::int from public.avisos_pendents),
  0,
  'el soci que dispara l''enganxada no veu cap pendent, ni el seu'
);
select is(
  (select count(*)::int from public.avisos where user_id = auth.uid()),
  1,
  'però sí el seu avís'
);
reset role;

-- ── 2. dos actius amb el mateix número ─────────────────────────────────────
update public.profile_contact set telefon = '912 34 56 02' where id = '00000000-0000-4000-8000-0000000e0002';

select is(
  (select avis_id is not null from public.avisos_pendents where id = (select id from fet where clau = 'ambigu')),
  true,
  'amb un sol actiu, el primer que hi arriba s''enganxa'
);

-- Un pendent nou per al mateix número, i ara hi ha dos actius.
update public.profile_contact set telefon = '+34 912 34 56 02' where id = '00000000-0000-4000-8000-0000000e0003';
select tests.authenticate_as('junta_alfa');
insert into fet select 'ambigu2', public.crea_avis_pendent(
  'Persona Ambigua', '912 34 56 02', now() - interval '1 day', 'mal_gest', 'Prova: ara sí ambigu');
reset role;

select is(
  (select coalesce(motiu, '∅') || '|' || (enllacat_at is null)::text
     from public.avisos_pendents where id = (select id from fet where clau = 'ambigu2')),
  'ambigu|true',
  'amb dos perfils actius, no s''enganxa i queda marcat com a ambigu'
);

-- Un dels dos es dona de baixa: queda un sol actiu, i l'estat ho decideix.
update public.profiles set estat = 'baixa' where id = '00000000-0000-4000-8000-0000000e0003';

select is(
  (select a.user_id::text from public.avisos_pendents p join public.avisos a on a.id = p.avis_id
    where p.id = (select id from fet where clau = 'ambigu2')),
  '00000000-0000-4000-8000-0000000e0002',
  'quan un dels dos passa a baixa, el que queda se l''enduu'
);

-- ── 3. un duplicat en baixa no fa ambigu res ───────────────────────────────
update public.profile_contact set telefon = '912345604' where id = '00000000-0000-4000-8000-0000000e0004';
select is(
  (select coalesce(motiu, '∅') || '|' || (enllacat_at is null)::text
     from public.avisos_pendents where id = (select id from fet where clau = 'baixa')),
  '∅|true',
  'un perfil de baixa sol no s''enduu cap pendent'
);

update public.profile_contact set telefon = '912 345 604' where id = '00000000-0000-4000-8000-0000000e0005';
select is(
  (select a.user_id::text from public.avisos_pendents p join public.avisos a on a.id = p.avis_id
    where p.id = (select id from fet where clau = 'baixa')),
  '00000000-0000-4000-8000-0000000e0005',
  'i amb un actiu i un de baixa amb el mateix número, s''enganxa a l''actiu sense ambigüitat'
);

-- ── 4. el telèfon canviat més tard ─────────────────────────────────────────
update public.profile_contact set telefon = '955 00 00 00' where id = '00000000-0000-4000-8000-0000000e0006';
select is(
  (select enllacat_at is null from public.avisos_pendents where id = (select id from fet where clau = 'canvi')),
  true,
  'amb un altre número, res'
);

select tests.authenticate_as('pend_canvi');
select lives_ok(
  $$ update public.profile_contact set telefon = '912-34-56-06' where id = auth.uid() $$,
  'el soci canvia el telèfon al seu perfil'
);
reset role;
select is(
  (select enllacat_via from public.avisos_pendents where id = (select id from fet where clau = 'canvi')),
  'telefon',
  'i el pendent s''enganxa'
);

-- ── 5. el sostre ───────────────────────────────────────────────────────────
update public.point_values set punts = 5 where mena = 'avisos' and clau = 'sostre_curs';
update public.profile_contact set telefon = '912 34 56 07' where id = '00000000-0000-4000-8000-0000000e0007';

select is(
  (select coalesce(motiu, '∅') || '|' || coalesce(telefon, '∅') || '|' || (enllacat_at is null)::text
     from public.avisos_pendents where id = (select id from fet where clau = 'sostre')),
  'avis_sostre|912 34 56 07|true',
  'si el sostre ho bloqueja, no es perd: es queda esperant, amb el motiu i el telèfon'
);

select is(
  (select count(*)::int from public.avisos where user_id = '00000000-0000-4000-8000-0000000e0007'),
  0,
  'i no deixa cap avís a mitges'
);
update public.point_values set punts = 200 where mena = 'avisos' and clau = 'sostre_curs';

-- ── 6. un pendent que peta ─────────────────────────────────────────────────
-- Una fallada que no és cap refús previst: un disparador de prova que fa petar
-- qualsevol avís amb aquesta nota. Viu dins d'aquesta transacció i se'n va amb
-- el `rollback`.
create function public.prova_fa_petar_un_avis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.nota = 'Prova: peta aquest' then
    raise exception 'peta a posta' using errcode = 'XX000';
  end if;
  return new;
end $$;
create trigger prova_fa_petar_un_avis before insert on public.avisos
  for each row execute function public.prova_fa_petar_un_avis();

select tests.authenticate_as('pend_peta');
select lives_ok(
  $$ update public.profile_contact set telefon = '912 34 56 08' where id = auth.uid() $$,
  'un pendent que peta no impedeix desar el telèfon'
);
reset role;

select is(
  (select telefon from public.profile_contact where id = '00000000-0000-4000-8000-0000000e0008'),
  '912 34 56 08',
  'el telèfon queda desat'
);

select is(
  (select motiu || '|' || motiu_codi || '|' || (enllacat_at is null)::text
     from public.avisos_pendents where id = (select id from fet where clau = 'peta')),
  'error|XX000|true',
  'el que peta es queda esperant, amb l''error desat com a motiu'
);

select is(
  (select a.user_id::text from public.avisos_pendents p join public.avisos a on a.id = p.avis_id
    where p.id = (select id from fet where clau = 'no_peta')),
  '00000000-0000-4000-8000-0000000e0008',
  'i l''altre del mateix número s''enganxa igualment'
);

drop trigger prova_fa_petar_un_avis on public.avisos;
drop function public.prova_fa_petar_un_avis();

-- ── i la forma ─────────────────────────────────────────────────────────────
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('enganxa_per_digits', 'enganxa_pel_telefon', 'enganxa_per_l_estat',
                         'enganxa_el_pendent_nou', 'enganxa_pendent')
       and (has_function_privilege('authenticated', p.oid, 'execute')
            or has_function_privilege('anon', p.oid, 'execute'))
  ),
  'cap de les funcions de l''enganxada no la pot cridar ningú des de fora'
);

select * from finish();
rollback;

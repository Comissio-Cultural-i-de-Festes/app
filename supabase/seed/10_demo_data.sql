-- Fixture data. LOCAL AND CI ONLY — seeds never travel with `db push`.
--
-- Everything here is obviously synthetic, not plausible-but-fake. The
-- association is small enough that a realistic Catalan name IS identifying
-- even when invented: someone will match it to a real person by coincidence
-- and there is no way to prove otherwise afterwards. So: NATO alphabet
-- handles, @example.test addresses (RFC 6761 reserved, can never resolve),
-- null phone numbers, and made-up school and venue names.
--
-- Never TecnoCampus, ESUPT, ESCSET, ESCST, Mataró, or a +34 6xx number. CI
-- greps this file for exactly those.

-- members
select tests.create_user('alfa',    '00000000-0000-4000-8000-000000000001', 'member', 'actiu', 'politecnica');
select tests.create_user('bravo',   '00000000-0000-4000-8000-000000000002', 'member', 'actiu', 'empresa');
select tests.create_user('charlie', '00000000-0000-4000-8000-000000000003', 'member', 'actiu', 'salut');
select tests.create_user('delta',   '00000000-0000-4000-8000-000000000004', 'member', 'actiu', 'politecnica');
select tests.create_user('echo',    '00000000-0000-4000-8000-000000000005', 'member', 'actiu', 'empresa');
select tests.create_user('foxtrot', '00000000-0000-4000-8000-000000000006', 'member', 'actiu', 'salut');
select tests.create_user('golf',    '00000000-0000-4000-8000-000000000007', 'member', 'actiu', 'politecnica');
select tests.create_user('hotel',   '00000000-0000-4000-8000-000000000008', 'member', 'actiu', 'empresa');

-- junta
select tests.create_user('junta_alfa',    '00000000-0000-4000-8000-0000000000a1', 'admin', 'actiu', 'politecnica');
select tests.create_user('junta_bravo',   '00000000-0000-4000-8000-0000000000a2', 'admin', 'actiu', 'empresa');
select tests.create_user('junta_charlie', '00000000-0000-4000-8000-0000000000a3', 'admin', 'actiu', 'salut');
select tests.create_user('cap',           '00000000-0000-4000-8000-0000000000a9', 'owner', 'actiu', 'politecnica');

-- edge cases the policies have to get right
select tests.create_user('pendent_alfa', '00000000-0000-4000-8000-0000000000b1', 'member', 'pendent');
select tests.create_user('baixa_alfa',   '00000000-0000-4000-8000-0000000000b2', 'member', 'baixa');
select tests.create_user('hidden_alfa',  '00000000-0000-4000-8000-0000000000b3', 'member', 'actiu', 'politecnica');

update public.profiles
   set hide_from_ranking = true
 where id = '00000000-0000-4000-8000-0000000000b3';

-- ── events ──────────────────────────────────────────────────────────────────
-- Times are always relative to now(), never hardcoded, so the fixtures stay
-- correct whenever the suite runs.

-- e1: published, revealed, free and unlimited -> a walk-in here is just in
insert into public.events (id, titulo, tipo, starts_at, plazas, precio_cents, puntos, teaser, reveal_at, published, created_by)
values ('00000000-0000-4000-8000-0000000000e1', 'Esdeveniment Alfa', 'fiesta',
        now() + interval '2 days', null, 0, 10, 'Alguna cosa', now() - interval '1 day', true,
        '00000000-0000-4000-8000-0000000000a1');

insert into public.event_details (event_id, descripcion, ubicacion, transport_info)
values ('00000000-0000-4000-8000-0000000000e1', 'Descripcio Alfa', 'Sala Alfa', 'Ultim tren a la 01:12');

-- e2: published, NOT yet revealed -> teaser only for a member
insert into public.events (id, titulo, tipo, starts_at, plazas, precio_cents, puntos, teaser, reveal_at, published, created_by)
values ('00000000-0000-4000-8000-0000000000e2', 'Esdeveniment Bravo', 'casa_rural',
        now() + interval '30 days', 30, 4500, 30, 'Ja ho sabras', now() + interval '10 days', true,
        '00000000-0000-4000-8000-0000000000a1');

insert into public.event_details (event_id, descripcion, ubicacion, transport_info)
values ('00000000-0000-4000-8000-0000000000e2', 'Descripcio Bravo secreta', 'Espai Bravo', 'Cotxe compartit');

-- e3: unpublished -> invisible to a member entirely
insert into public.events (id, titulo, tipo, starts_at, plazas, precio_cents, puntos, published, created_by)
values ('00000000-0000-4000-8000-0000000000e3', 'Esdeveniment Charlie', 'actividad',
        now() + interval '60 days', 20, 0, 10, false,
        '00000000-0000-4000-8000-0000000000a1');

-- e4: published, revealed, HAS places and a price -> a walk-in here is amber
insert into public.events (id, titulo, tipo, starts_at, plazas, precio_cents, puntos, teaser, reveal_at, published, created_by)
values ('00000000-0000-4000-8000-0000000000e4', 'Esdeveniment Delta', 'casa_rural',
        now() + interval '5 days', 30, 3000, 30, 'Cap de setmana', now() - interval '1 day', true,
        '00000000-0000-4000-8000-0000000000a2');

insert into public.event_details (event_id, descripcion, ubicacion)
values ('00000000-0000-4000-8000-0000000000e4', 'Descripcio Delta', 'Casa Delta');

-- ── attendances: one of each visibility case on e1 ──────────────────────────
insert into public.attendances (user_id, event_id, estado) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', 'si'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000e1', 'si'),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000e1', 'potser'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000e1', 'no'),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000e1', 'si'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000e1', 'espera');

-- echo is signed up for the paid event, foxtrot is not (the walk-in case)
insert into public.attendances (user_id, event_id, estado) values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000e4', 'si');

-- ── event_content: one revealed, one still scheduled ────────────────────────
insert into public.event_content (event_id, tipus, titol, cos, visible_from, ordre) values
  ('00000000-0000-4000-8000-0000000000e1', 'text', 'Ja visible',
   '{"text":"Aixo es pot llegir"}'::jsonb, now() - interval '1 hour', 0),
  ('00000000-0000-4000-8000-0000000000e1', 'equips', 'Encara no',
   '{"equips":["Equip u","Equip dos"]}'::jsonb, now() + interval '7 days', 1);

-- ── points: enough for the ranking to be non-trivial ────────────────────────
insert into public.points_log (user_id, event_id, motivo, puntos, granted_by) values
  ('00000000-0000-4000-8000-000000000001', null, 'montaje', 20, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000002', null, 'manual', 45, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-000000000003', null, 'trajo_gente', 15, '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b3', null, 'manual', 999, '00000000-0000-4000-8000-0000000000a1');

-- ── invites ─────────────────────────────────────────────────────────────────
insert into public.invites (id, codi, created_by, expires_at, revoked, max_usos) values
  ('00000000-0000-4000-8000-0000000000c1', 'CODI-VALID-0001',
   '00000000-0000-4000-8000-0000000000a1', now() + interval '30 days', false, 10),
  ('00000000-0000-4000-8000-0000000000c2', 'CODI-REVOCAT-02',
   '00000000-0000-4000-8000-0000000000a1', now() + interval '30 days', true, 10),
  ('00000000-0000-4000-8000-0000000000c3', 'CODI-CADUCAT-03',
   '00000000-0000-4000-8000-0000000000a1', now() - interval '1 day', false, 10);

-- The schema from section 3 of the technical spec.
--
-- Two deliberate departures, both explained where they happen:
--   * profiles.estat defaults to 'pendent', not 'actiu'.
--   * the reveal-gated columns of `events` live in a child table.
--
-- Every timestamp is timestamptz in UTC and formatted on the client. Events run
-- through the night, and a bare `date` makes "was that Saturday or Sunday?"
-- ambiguous.

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nombre            text not null,
  avatar_url        text,
  escola            text check (escola in ('politecnica', 'empresa', 'salut')),
  grau              text,
  curs              int check (curs between 1 and 6),
  telefon           text,
  -- DEPARTURE FROM THE SPEC, and the one that matters most.
  --
  -- Section 3 has `default 'actiu'`. Supabase Auth will send a magic link to
  -- any address that asks for one, so with that default anyone who reaches the
  -- login page becomes a full member without ever seeing an invitation, and
  -- the whole of section 4 stops meaning anything.
  --
  -- The only routes from 'pendent' to 'actiu' are public.redeem_invite() and
  -- an admin approving from the junta area.
  estat             text not null default 'pendent'
                      check (estat in ('pendent', 'actiu', 'baixa')),
  role              text not null default 'member'
                      check (role in ('member', 'admin', 'owner')),
  qr_token          uuid not null default gen_random_uuid(),
  hide_from_ranking boolean not null default false,
  created_at        timestamptz not null default now()
);

comment on column public.profiles.qr_token is
  'A bearer credential: whoever holds it can be checked in, and a check-in '
  'writes to points_log. SELECT on this column is revoked from authenticated '
  'in 03_grants.sql; a member reads their own through public.my_qr().';

comment on column public.profiles.telefon is
  'Personal data, kept so the junta can reconcile with the WhatsApp group. '
  'SELECT is revoked from authenticated; the junta reads it through '
  'public.admin_member_contacts().';

comment on column public.profiles.hide_from_ranking is
  'A display preference, NOT a privacy guarantee. The public "si" attendance '
  'list plus events.puntos lets anyone reconstruct anyone else''s score. Do '
  'not describe this to members as hiding their points.';

-- qr_token is looked up once per scan, at the door, under time pressure.
create unique index profiles_qr_token_key on public.profiles (qr_token);
create index profiles_role_idx on public.profiles (role) where role <> 'member';
create index profiles_escola_idx on public.profiles (escola) where escola is not null;

-- ── invites ─────────────────────────────────────────────────────────────────
create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  codi       text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked    boolean not null default false,
  max_usos   int check (max_usos is null or max_usos > 0),
  created_at timestamptz not null default now()
);

create index invites_created_by_idx on public.invites (created_by);

create table public.invite_uses (
  invite_id  uuid not null references public.invites (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

create index invite_uses_user_id_idx on public.invite_uses (user_id);

-- ── events ──────────────────────────────────────────────────────────────────
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  tipo         text not null check (tipo in ('fiesta', 'casa_rural', 'actividad')),
  starts_at    timestamptz not null,
  plazas       int check (plazas is null or plazas > 0),
  precio_cents int not null default 0 check (precio_cents >= 0),
  puntos       int not null default 10,
  teaser       text,
  reveal_at    timestamptz,
  published    boolean not null default false,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.events is
  'The always-public half of an event: enough for a teaser and a countdown. '
  'Everything that has to stay hidden until reveal_at lives in event_details.';

create index events_published_starts_at_idx on public.events (published, starts_at desc);
create index events_created_by_idx on public.events (created_by);

-- DEPARTURE FROM THE SPEC: a child table rather than columns on `events`.
--
-- Section 7 wants the row to still appear before reveal_at but with only the
-- public fields. RLS cannot hide a column, so keeping these on `events` forces
-- either a security-definer view over an admin-only table (two objects saying
-- different things to different people) or a permanent column-level revoke
-- that also blinds the junta. Splitting the table turns the reveal into an
-- ordinary row predicate, and the view stops being a security boundary at all.
--
-- It also fails closed: add a column here next term and it is reveal-gated
-- automatically, instead of leaking until someone remembers to edit a CASE.
create table public.event_details (
  event_id       uuid primary key references public.events (id) on delete cascade,
  descripcion    text,
  ubicacion      text,
  ends_at        timestamptz,
  cover_url      text,
  transport_info text
);

comment on table public.event_details is
  'Reveal-gated. Visible to members only once events.reveal_at has passed, by '
  'Postgres now(), never a device clock. Admins always see it so they can '
  'prepare the content.';

-- ── attendances ─────────────────────────────────────────────────────────────
create table public.attendances (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  event_id        uuid not null references public.events (id) on delete cascade,
  estado          text not null default 'potser'
                    check (estado in ('si', 'potser', 'no', 'espera', 'asistio', 'cancelado')),
  pagado          boolean not null default false,
  checked_in_at   timestamptz,
  checked_in_by   uuid references public.profiles (id) on delete set null,
  entry_photo_url text,
  exit_photo_url  text,
  was_registered  boolean,
  created_at      timestamptz not null default now(),
  unique (user_id, event_id)
);

comment on column public.attendances.was_registered is
  'Whether the person had said si/potser before being checked in. Null until '
  'check-in. False marks a walk-in, which the junta reconciles afterwards.';

create index attendances_event_estado_idx on public.attendances (event_id, estado);
create index attendances_user_id_idx on public.attendances (user_id);
create index attendances_checked_in_by_idx on public.attendances (checked_in_by);

-- ── rides ───────────────────────────────────────────────────────────────────
create table public.rides (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  sentit       text not null check (sentit in ('anada', 'tornada', 'anada_tornada')),
  origen       text not null,
  hora_sortida timestamptz,
  places       int not null check (places between 1 and 8),
  notes        text,
  created_at   timestamptz not null default now()
);

create index rides_event_id_idx on public.rides (event_id);
create index rides_driver_id_idx on public.rides (driver_id);

create table public.ride_seats (
  ride_id    uuid not null references public.rides (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create index ride_seats_user_id_idx on public.ride_seats (user_id);

-- ── proposals ───────────────────────────────────────────────────────────────
create table public.proposals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  titol      text not null,
  descripcio text,
  estat      text not null default 'oberta'
               check (estat in ('oberta', 'acceptada', 'descartada')),
  event_id   uuid references public.events (id) on delete set null,
  vots       int not null default 0 check (vots >= 0),
  created_at timestamptz not null default now()
);

comment on column public.proposals.vots is
  'Maintained by a trigger on proposal_votes. Not in the UPDATE column grant, '
  'so nobody can inflate it. Individual votes stay private; only the tally is '
  'public, which is what lets the list be ordered without publishing who '
  'voted for what.';

create index proposals_user_id_idx on public.proposals (user_id);
create index proposals_event_id_idx on public.proposals (event_id);
create index proposals_open_votes_idx on public.proposals (vots desc) where estat = 'oberta';

create table public.proposal_votes (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create index proposal_votes_user_id_idx on public.proposal_votes (user_id);

-- ── event_content ───────────────────────────────────────────────────────────
create table public.event_content (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  tipus        text not null check (tipus in ('text', 'imatge', 'equips', 'prova')),
  titol        text,
  cos          jsonb,
  visible_from timestamptz,
  ordre        int not null default 0
);

create index event_content_event_visible_idx
  on public.event_content (event_id, visible_from, ordre);

-- ── points_log ──────────────────────────────────────────────────────────────
-- APPEND-ONLY. Never a mutable counter on profiles: if there is an argument it
-- gets recalculated, and if there is a bug the history survives. Corrections
-- are compensating negative rows, never edits.
create table public.points_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  event_id          uuid references public.events (id) on delete set null,
  motivo            text not null
                      check (motivo in ('asistencia', 'montaje', 'trajo_gente', 'propuso', 'manual')),
  puntos            int not null,
  nota              text,
  granted_by        uuid references public.profiles (id) on delete set null,
  -- Generated once by the scanner at the moment of the scan and never
  -- regenerated, so replaying the offline queue collapses onto one row even if
  -- the same phone retries a dozen times.
  client_request_id uuid,
  created_at        timestamptz not null default now()
);

-- The domain invariant: one attendance award per person per event. This is
-- what makes a resent offline queue harmless, and it holds even when two admin
-- phones scan the same person at the same instant, because a unique index is
-- enforced by the storage engine rather than by application logic.
create unique index points_log_asistencia_unic
  on public.points_log (user_id, event_id)
  where motivo = 'asistencia';

-- Collapses retries of any operation, not just attendance.
create unique index points_log_client_request_id_key
  on public.points_log (client_request_id)
  where client_request_id is not null;

create index points_log_user_id_idx on public.points_log (user_id);
create index points_log_event_id_idx on public.points_log (event_id);
create index points_log_granted_by_idx on public.points_log (granted_by);

-- ── audit_log ───────────────────────────────────────────────────────────────
-- Role changes, approvals and money are worth a trail. The junta rotates every
-- year and "who made them an admin?" is otherwise unanswerable.
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  accio      text not null,
  target_id  uuid,
  detall     jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

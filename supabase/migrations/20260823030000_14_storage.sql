-- Two buckets, and they are not the same kind of thing.
--
-- `event-covers` is the poster. Any member may look at it, the junta uploads
-- it, and it is the single most load-bearing image in the app — the brief says
-- the cover is what makes people tap through.
--
-- `door-photos` is a photograph of somebody's face, taken at a door, usually
-- at night, often without them looking at the camera. It is personal data of
-- the most ordinary and most sensitive kind, and everything about this bucket
-- is arranged so that it can only ever be seen by the four people who need it
-- to reconcile a walk-in on Monday morning.
--
-- WHY NEITHER BUCKET IS PUBLIC. A "public" Supabase bucket is public to the
-- internet: the URL is unguessable but unauthenticated, it never expires, and
-- it keeps working after somebody leaves the association. For the covers that
-- is merely wrong — a cover belongs to an event that may still be behind
-- reveal_at, and a link that leaks is a spoiler that cannot be recalled. For
-- the door photos it would be indefensible. Both are private; both are read
-- through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- 5 MB is a generous phone photo once the client has resized it, and small
  -- enough that a mistake — the original 12 MP frame — is refused rather than
  -- quietly costing the association storage for ever.
  ('event-covers', 'event-covers', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('door-photos', 'door-photos', false, 2097152,
   array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ── event covers ────────────────────────────────────────────────────────────
-- Read by anybody who may see events at all, which since migration 13 includes
-- people still waiting for approval. Reusing the same helper keeps the cover
-- and the event it belongs to visible to exactly the same people: a poster
-- nobody can open is worse than no poster.
create policy "covers are readable by members"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-covers' and (select private.is_member_or_pending()));

create policy "covers are written by the junta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-covers' and (select private.is_admin()));

create policy "covers are replaced by the junta"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-covers' and (select private.is_admin()))
  with check (bucket_id = 'event-covers' and (select private.is_admin()));

create policy "covers are removed by the junta"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-covers' and (select private.is_admin()));

-- ── door photos ─────────────────────────────────────────────────────────────
-- The junta and nobody else. Not even the person photographed, for now: there
-- is no screen that shows them their own, and inventing a read path before
-- there is a screen and a privacy notice would be the wrong order.
--
-- No UPDATE policy at all. A door photo is a record of a moment; replacing one
-- in place is not something anybody should be able to do quietly. Deleting is
-- allowed, because somebody will ask for theirs to be removed and the answer
-- has to be yes.
create policy "door photos are the junta's"
  on storage.objects for select to authenticated
  using (bucket_id = 'door-photos' and (select private.is_admin()));

create policy "door photos are written by the junta"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'door-photos' and (select private.is_admin()));

create policy "door photos can be deleted"
  on storage.objects for delete to authenticated
  using (bucket_id = 'door-photos' and (select private.is_admin()));

import { beforeAll, describe, expect, it } from 'vitest'

import { anonClient, as, F, rpc, serviceClient } from './helpers'

/**
 * A note on what these assert, because it is easy to write a version of this
 * file that passes forever regardless of the policies.
 *
 * An UPDATE filtered out by RLS returns HTTP 200 with an empty array. A
 * revoked privilege returns 42501. `expect(data).toHaveLength(0)` passes in
 * both cases — and keeps passing the day somebody deletes the protection.
 *
 * So: where the answer is "never", the schema enforces it with a grant and the
 * test asserts the error code. Where it depends on the row, it is a policy and
 * the test checks an allowed row and a denied row together, so an over-broad
 * policy fails.
 */

describe('points_log is unreachable from a client', () => {
  it('a member gets a hard denial, not a silent no-op, on insert', async () => {
    const member = await as('alfa')
    const { error } = await member
      .from('points_log')
      .insert({ user_id: F.alfa, motivo: 'manual', puntos: 9999 })

    expect(error?.code).toBe('42501')
  })

  it('and on update, even of their own row', async () => {
    const member = await as('alfa')
    const { error } = await member.from('points_log').update({ puntos: 9999 }).eq('user_id', F.alfa)

    expect(error?.code).toBe('42501')
  })

  it('an admin cannot delete from the ledger either — corrections are new rows', async () => {
    const admin = await as('junta_alfa')
    const { error } = await admin.from('points_log').delete().eq('user_id', F.alfa)

    expect(error?.code).toBe('42501')
  })

  it('a member reads their own rows and nobody else’s', async () => {
    const member = await as('alfa')
    const { data, error } = await member.from('points_log').select('user_id')

    expect(error).toBeNull()
    expect(data?.every((r) => r.user_id === F.alfa)).toBe(true)
  })
})

describe('identity cannot be self-assigned', () => {
  it('a member cannot promote themselves', async () => {
    const member = await as('alfa')
    const { error } = await member.from('profiles').update({ role: 'owner' }).eq('id', F.alfa)

    expect(error?.code).toBe('42501')
  })

  it('nor smuggle a role change alongside a legitimate edit', async () => {
    const member = await as('alfa')
    const { error } = await member
      .from('profiles')
      .update({ nombre: 'Alfa', role: 'admin' })
      .eq('id', F.alfa)

    expect(error?.code).toBe('42501')

    const { data } = await serviceClient().from('profiles').select('role').eq('id', F.alfa).single()
    expect(data?.role).toBe('member')
  })

  it('and can still edit the fields that are theirs', async () => {
    const member = await as('alfa')
    const { data, error } = await member
      .from('profiles')
      .update({ hide_from_ranking: false })
      .eq('id', F.alfa)
      .select('id, hide_from_ranking')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('select(*) on profiles works and carries nothing sensitive', async () => {
    // This is why the credential and the phone number are in their own tables.
    // Revoking them at the column level protected them just as well, but it
    // made `*` fail — and a guarantee that shows up as a permission error on
    // an ordinary query is a guarantee somebody eventually removes.
    const member = await as('alfa')
    const { data, error } = await member
      .from('profiles')
      .select('*')
      .limit(1)
      .returns<Record<string, unknown>[]>()

    expect(error).toBeNull()
    const columns = Object.keys(data?.[0] ?? {})
    expect(columns).not.toContain('qr_token')
    expect(columns).not.toContain('telefon')
    expect(columns).toContain('nombre')
  })
})

describe('the two things that are not the association’s business', () => {
  it('a QR token is readable by its owner and nobody else', async () => {
    const member = await as('alfa')

    const { data: mine, error } = await member.from('profile_secret').select('id, qr_token')
    expect(error).toBeNull()
    expect(mine).toHaveLength(1)
    expect(mine?.[0]?.id).toBe(F.alfa)

    const { data: theirs } = await member.from('profile_secret').select('*').eq('id', F.bravo)
    expect(theirs).toEqual([])

    const { data: viaRpc } = await rpc<string>(member, 'my_qr')
    expect(viaRpc).toBe(mine?.[0]?.qr_token)
  })

  it('and not even by an admin', async () => {
    // There is no admin policy on profile_secret, on purpose. The junta never
    // needs a token — check_in() resolves it inside a definer function — and
    // one compromised admin account must not yield 300 forgeable credentials.
    const admin = await as('junta_alfa')
    const { data } = await admin.from('profile_secret').select('id')

    expect(data?.map((r) => String(r.id))).toEqual([F.juntaAlfa])
  })

  it('a phone number is for its owner and the junta, not the association', async () => {
    const svc = serviceClient()
    await svc.from('profile_contact').upsert({ id: F.bravo, telefon: '+1 555 0142' })

    const member = await as('alfa')
    const { data: seen } = await member.from('profile_contact').select('id').eq('id', F.bravo)
    expect(seen).toEqual([])

    const admin = await as('junta_alfa')
    const { data: junta } = await admin
      .from('profile_contact')
      .select('id, telefon')
      .eq('id', F.bravo)
    expect(junta).toHaveLength(1)
    expect(junta?.[0]?.telefon).toBe('+1 555 0142')

    await svc.from('profile_contact').update({ telefon: null }).eq('id', F.bravo)
  })

  it('and a member can set their own', async () => {
    // Update, not upsert: the row is created by the signup trigger, so it is
    // always there and INSERT is deliberately not granted.
    const member = await as('alfa')
    const { data, error } = await member
      .from('profile_contact')
      .update({ telefon: '+1 555 0101' })
      .eq('id', F.alfa)
      .select('id, telefon')

    expect(error).toBeNull()
    expect(data?.[0]?.telefon).toBe('+1 555 0101')

    // Somebody else's is filtered out by the policy, so it matches no rows.
    const { data: theirs } = await member
      .from('profile_contact')
      .update({ telefon: '+1 555 0199' })
      .eq('id', F.bravo)
      .select('id')
    expect(theirs).toEqual([])

    await serviceClient().from('profile_contact').update({ telefon: null }).eq('id', F.alfa)
  })
})

describe('scheduled content is filtered by the server clock', () => {
  it('an event before reveal_at surfaces as a teaser with the details nulled', async () => {
    const member = await as('alfa')
    const { data, error } = await member
      .from('events_public')
      .select('titulo, teaser, revelat, descripcion, ubicacion')
      .eq('id', F.e2)
      .single()

    expect(error).toBeNull()
    expect(data?.teaser).toBeTruthy()
    expect(data?.revelat).toBe(false)
    // El títol també, des de la migració 44. Fins llavors arribava sempre:
    // era una columna de `events`, que té un grant de taula sencera.
    expect(data?.titulo).toBeNull()
    expect(data?.descripcion).toBeNull()
    expect(data?.ubicacion).toBeNull()
  })

  it('and no other door reaches the title either', async () => {
    // Aquesta és la prova que la vista no era la frontera. Abans de la
    // migració 44 el títol es podia demanar directament a `events`, i dos
    // llocs del client ho feien; ara la columna no hi és i la taula que la té
    // està filtrada.
    const member = await as('alfa')

    const direct = await member.from('event_title').select('titulo').eq('event_id', F.e2)
    expect(direct.data).toEqual([])

    // I la junta sí, perquè ha de poder llegir el que està preparant.
    const admin = await as('junta_alfa')
    const theirs = await admin.from('event_title').select('titulo').eq('event_id', F.e2)
    expect(theirs.data).toHaveLength(1)
    expect(theirs.data?.[0]?.titulo).toBeTruthy()
  })

  it('and the embed the profile really uses cannot go round it', async () => {
    // `points_log → events → event_title`, que és la consulta del registre de
    // punts del perfil. Un salt més que abans perquè `points_log` no té clau
    // forana cap al títol; hi arriba per `events`, i la política del final és
    // la que decideix.
    const svc = serviceClient()

    // Una fila de punts sobre cada esdeveniment, o la prova no mira res:
    // sense cap fila que hi apunti, no trobar el títol és no haver preguntat.
    // Les posa la prova i no el seed —quin esdeveniment té punts al seed
    // canvia, i una prova que ho dóna per fet passa en una base bruta i falla
    // en una neta. Idempotents pel `client_request_id`, que té índex únic
    // parcial: la segona passada les refusa i tant li fa.
    for (const [eventId, request] of [
      [F.e2, '00000000-0000-4000-8000-0000000044e2'],
      [F.e1, '00000000-0000-4000-8000-0000000044e1'],
    ] as const) {
      await svc.from('points_log').insert({
        user_id: F.alfa,
        event_id: eventId,
        motivo: 'manual',
        puntos: 1,
        client_request_id: request,
      })
    }

    const { data: secret } = await svc
      .from('event_title')
      .select('titulo')
      .eq('event_id', F.e2)
      .single()
    const hidden = secret?.titulo ?? ''
    expect(hidden).not.toBe('')

    const member = await as('alfa')
    const points = await member
      .from('points_log')
      .select('id, motivo, event_id, events(event_title(titulo))')
      .eq('user_id', F.alfa)

    expect(points.error).toBeNull()
    const onHidden = points.data?.filter((r) => r.event_id === F.e2)
    expect(onHidden?.length).toBeGreaterThan(0)
    expect(JSON.stringify(points.data)).not.toContain(hidden)

    // I el camí funciona: el títol d'un esdeveniment revelat sí que hi arriba.
    // Sense aquesta meitat, l'anterior passaria igual el dia que l'embed es
    // trenqui del tot i no torni mai res.
    const { data: shown } = await svc
      .from('event_title')
      .select('titulo')
      .eq('event_id', F.e1)
      .single()
    const visible = shown?.titulo ?? ''
    expect(visible).not.toBe('')

    const onRevealed = await member
      .from('points_log')
      .select('id, event_id, events(event_title(titulo))')
      .eq('user_id', F.alfa)
      .eq('event_id', F.e1)
    expect(onRevealed.data?.length).toBeGreaterThan(0)
    expect(JSON.stringify(onRevealed.data)).toContain(visible)
  })

  it('and the detail row is genuinely absent, not just hidden by the view', async () => {
    const member = await as('alfa')
    const { data } = await member.from('event_details').select('*').eq('event_id', F.e2)
    expect(data).toEqual([])

    const admin = await as('junta_alfa')
    const { data: adminSees } = await admin.from('event_details').select('*').eq('event_id', F.e2)
    expect(adminSees).toHaveLength(1)
  })

  it('an unpublished event does not exist for a member', async () => {
    const member = await as('alfa')
    const { data } = await member.from('events').select('id').eq('id', F.e3)
    expect(data).toEqual([])
  })
})

describe('attendance visibility survives PostgREST, not just SQL', () => {
  it('an embed does not leak the maybes and the nos', async () => {
    // The shape pgTAP can never see. RLS applies per table inside an embed,
    // but that is worth proving rather than assuming.
    const member = await as('alfa')
    const { data, error } = await member
      .from('events')
      .select('id, attendances(user_id, estado)')
      .eq('id', F.e1)
      .single()

    expect(error).toBeNull()
    const rows = (data?.attendances ?? []) as { user_id: string; estado: string }[]
    const others = rows.filter((r) => r.user_id !== F.alfa)

    expect(others.every((r) => r.estado === 'si' || r.estado === 'asistio')).toBe(true)
    expect(others.map((r) => r.user_id)).not.toContain(F.charlie)
    expect(others.map((r) => r.user_id)).not.toContain(F.delta)
  })

  it('an exact count is the filtered count, not the real one', async () => {
    // `select('id')` and not `select('*')`: migration 34 took the table-wide
    // SELECT off attendances and gave it back column by column, so that no
    // member can list the storage path of everybody else's face. A star from a
    // member is now a privilege error rather than a filtered count.
    const member = await as('alfa')
    const { count } = await member
      .from('attendances')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', F.e1)

    const { count: actual } = await serviceClient()
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', F.e1)

    // Not an absolute number: the check-in suite runs first and turns a
    // couple of rows into 'asistio'. What must hold is that the count is
    // filtered, and that nothing outside the public list is inside it.
    expect(actual).toBeGreaterThan(count ?? 0)

    const { data: visible } = await member.from('attendances').select('estado').eq('event_id', F.e1)
    expect(visible?.every((r) => r.estado === 'si' || r.estado === 'asistio')).toBe(true)
    expect(visible).toHaveLength(count ?? -1)
  })
})

describe('the ranking publishes aggregates without publishing the ledger', () => {
  it('a member can read it', async () => {
    const member = await as('alfa')
    const { data, error } = await member.from('ranking').select('user_id, punts')

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
  })

  it('and it leaves out anyone who opted out', async () => {
    const member = await as('alfa')
    const { data } = await member.from('ranking').select('user_id')
    const ids = (data ?? []).map((r) => String(r.user_id))
    expect(ids).not.toContain(F.hidden)
  })

  it('while their individual rows stay private', async () => {
    const member = await as('alfa')
    const { data } = await member.from('points_log').select('id').eq('user_id', F.hidden)
    expect(data).toEqual([])
  })
})

describe('anon', () => {
  it('reads nothing', async () => {
    const anon = anonClient()
    // Written out one by one rather than looped over a list of names: the
    // client is typed, so each name here is checked against the real schema
    // and a table renamed out from under this test stops compiling instead of
    // quietly passing because the request 404s.
    const reads = [
      ['profiles', anon.from('profiles').select('*').limit(1)],
      ['events', anon.from('events').select('*').limit(1)],
      ['attendances', anon.from('attendances').select('*').limit(1)],
      ['points_log', anon.from('points_log').select('*').limit(1)],
      ['ranking', anon.from('ranking').select('*').limit(1)],
      ['ranking_periods', anon.from('ranking_periods').select('*').limit(1)],
    ] as const

    for (const [table, read] of reads) {
      const { error } = await read
      expect(error, `anon could read ${table}`).not.toBeNull()
    }
  })

  it('may check an invitation code, and gets the same answer for invalid and spent', async () => {
    const anon = anonClient()
    interface Preview {
      valid: boolean
      expires_at?: string | null
    }
    const valid = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'ALFA-7F3K' })
    const revoked = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'ALFA-REVK' })
    const expired = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'ALFA-OLD1' })
    const missing = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'NO-EXISTEIX' })

    // A valid code also carries its expiry, because the invitation screen
    // shows it. No leak: the caller already holds the code.
    expect(valid.data).toMatchObject({ valid: true })

    // The negative answers carry nothing at all, and they are byte-identical
    // to each other. That is the property that stops a code being probed for
    // having once been real, or for having just run out.
    expect(revoked.data).toEqual({ valid: false })
    expect(expired.data).toEqual({ valid: false })
    expect(missing.data).toEqual({ valid: false })
  })

  it('cannot redeem one', async () => {
    const { error } = await anonClient().rpc('redeem_invite', { p_codi: 'ALFA-7F3K' })
    expect(error).not.toBeNull()
  })
})

describe('a door photo can only be signed by whose face it is', () => {
  // The wall the whole diptych rests on, and the one pgTAP cannot see: signing
  // a URL is an HTTP call into the storage API, not a SELECT anybody can run.
  const BUCKET = 'door-photos'
  const mine = `sortida/${F.e1}/${F.alfa}/rls.jpg`
  const theirs = `sortida/${F.e1}/${F.bravo}/rls.jpg`

  beforeAll(async () => {
    const svc = serviceClient()
    const body = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
    for (const path of [mine, theirs]) {
      await svc.storage.from(BUCKET).upload(path, body, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    }
  })

  it('signs your own', async () => {
    const member = await as('alfa')
    const { data, error } = await member.storage.from(BUCKET).createSignedUrl(mine, 60)
    expect(error).toBeNull()
    expect(data?.signedUrl).toContain(encodeURIComponent(BUCKET))
  })

  it("and refuses somebody else's", async () => {
    const member = await as('alfa')
    const { data, error } = await member.storage.from(BUCKET).createSignedUrl(theirs, 60)
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('and hides the exit half from the junta, which the camera screen promises', async () => {
    // «Aquesta foto no la veu ningú més. Ni la junta, ni el grup, ni el
    // rànquing» is printed on the screen that takes the picture. A promise
    // made there has to hold here.
    const junta = await as('junta_alfa')
    for (const path of [mine, theirs]) {
      const { error } = await junta.storage.from(BUCKET).createSignedUrl(path, 60)
      expect(error).not.toBeNull()
    }
  })

  it('while the junta signs the entry half, which is what makes a walk-in checkable', async () => {
    const svc = serviceClient()
    const door = `entrada/${F.e1}/${F.bravo}/rls.jpg`
    const body = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
    await svc.storage.from(BUCKET).upload(door, body, {
      contentType: 'image/jpeg',
      upsert: true,
    })

    const junta = await as('junta_alfa')
    const { error } = await junta.storage.from(BUCKET).createSignedUrl(door, 60)
    expect(error).toBeNull()

    // And a member still cannot look at somebody else's door photograph.
    const member = await as('alfa')
    const denied = await member.storage.from(BUCKET).createSignedUrl(door, 60)
    expect(denied.error).not.toBeNull()
  })

  it('lets you upload your own entry photo now that you are the one taking it', async () => {
    // Migration 36 moved `entrada/` from the junta to the member: the scanner
    // stopped firing by itself, so the folder belongs to whose face it is.
    const member = await as('alfa')
    const body = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })

    // Un nom nou a cada passada, com fa l'app: aquesta suite escriu a la
    // mateixa base i no fa rollback, i `upsert` no és sortida perquè seria un
    // UPDATE i el bucket no en té política —a posta, perquè cada foto és un
    // fitxer nou amb la seva hora i no se'n substitueix cap.
    const stamp = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`
    const own = await member.storage
      .from(BUCKET)
      .upload(`entrada/${F.e1}/${F.alfa}/${stamp}.jpg`, body, { contentType: 'image/jpeg' })
    expect(own.error).toBeNull()

    const other = await member.storage
      .from(BUCKET)
      .upload(`entrada/${F.e1}/${F.bravo}/${stamp}.jpg`, body, { contentType: 'image/jpeg' })
    expect(other.error).not.toBeNull()
  })

  it('lets you delete your own exit photo and nobody else do it', async () => {
    // The one thing pgTAP cannot reach: `storage.protect_delete()` refuses
    // every direct DELETE, so the policy only ever runs behind the API.
    const bravo = await as('bravo')
    const refused = await bravo.storage.from(BUCKET).remove([mine])
    // The API reports a refused delete as an empty result rather than an
    // error, so the object still being there is the assertion.
    expect(refused.data?.length ?? 0).toBe(0)

    const member = await as('alfa')
    const { data } = await member.storage.from(BUCKET).remove([mine])
    expect(data?.length).toBe(1)

    const gone = await member.storage.from(BUCKET).createSignedUrl(mine, 60)
    expect(gone.error).not.toBeNull()
  })
})

describe('ratxes i insígnies', () => {
  interface Streak {
    actual: number
    millor: number
    perduda: number
    trencada_el: string | null
    compten: number
    hi_has_anat: number
  }

  it('a member gets their own streak and a pending profile gets a hard denial', async () => {
    const member = await as('alfa')
    const { data, error } = await rpc<Streak>(member, 'my_streak')

    expect(error).toBeNull()
    expect(typeof data?.actual).toBe('number')
    expect(typeof data?.millor).toBe('number')
    // The invariant that has to hold for every possible history: you cannot be
    // on a longer run right now than the longest run you have ever had.
    expect(data!.actual).toBeLessThanOrEqual(data!.millor)
    expect(data!.hi_has_anat).toBeLessThanOrEqual(data!.compten)

    const pendent = await as('pendent_alfa')
    const denied = await rpc<Streak>(pendent, 'my_streak')
    expect(denied.error?.code).toBe('42501')
  })

  it('anon cannot ask for a streak at all', async () => {
    const { error } = await rpc<Streak>(anonClient(), 'my_streak')
    expect(error).not.toBeNull()
  })

  it('hands out what you already earned, and hands it out once', async () => {
    const member = await as('alfa')
    const first = await member.rpc('my_badges')
    expect(first.error).toBeNull()
    expect(first.data?.map((b) => b.codi)).toContain('primera')

    // Idempotence is the whole reason this can be called on every screen open.
    // It also makes this test rerunnable, which matters: this suite writes to
    // the same database and rolls nothing back.
    const second = await member.rpc('my_badges')
    expect(second.data?.length).toBe(first.data?.length)
  })

  it('cannot be given to yourself, or marked seen by hand', async () => {
    const member = await as('alfa')

    const insert = await member.from('badges').insert({ user_id: F.alfa, codi: 'vint_i_cinc' })
    expect(insert.error?.code).toBe('42501')

    const update = await member.from('badges').update({ seen_at: null }).eq('user_id', F.alfa)
    expect(update.error?.code).toBe('42501')

    const remove = await member.from('badges').delete().eq('user_id', F.alfa)
    expect(remove.error?.code).toBe('42501')
  })

  it('counts who else has one without opening the table', async () => {
    // The sheet says «la tenen 23 de 97». `badges` is readable only for
    // yourself, so if this ever starts returning nothing the count silently
    // disappears from the screen rather than erroring — hence asserting the
    // shape and not just the absence of an error.
    interface Holders {
      codi: string
      quants: number
      total: number
      cares: string[] | null
    }
    const member = await as('alfa')
    await member.rpc('my_badges')

    const { data, error } = await rpc<Holders[]>(member, 'badge_holders')
    expect(error).toBeNull()

    const first = data?.find((h) => h.codi === 'primera')
    expect(first?.quants).toBeGreaterThan(0)
    expect(first?.total).toBeGreaterThanOrEqual(first?.quants ?? 0)

    const anon = await rpc<Holders[]>(anonClient(), 'badge_holders')
    expect(anon.error).not.toBeNull()
  })

  it('shows you yours and nobody else’s, and the junta everyone’s', async () => {
    const bravo = await as('bravo')
    await bravo.rpc('my_badges')

    const member = await as('alfa')
    await member.rpc('my_badges')

    const { data, error } = await member.from('badges').select('user_id')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    expect(data?.every((r) => r.user_id === F.alfa)).toBe(true)

    const admin = await as('junta_alfa')
    const seen = await admin.from('badges').select('user_id')
    expect(seen.data?.some((r) => r.user_id === F.bravo)).toBe(true)
  })
})

describe('galeria', () => {
  const BUCKET = 'event-photos'
  const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })

  /** Una activitat on l'alfa hi va ser de debò, segons el seed. */
  let attended = ''

  beforeAll(async () => {
    const { data } = await serviceClient()
      .from('attendances')
      .select('event_id')
      .eq('user_id', F.alfa)
      .eq('estado', 'asistio')
      .limit(1)
    attended = data?.[0]?.event_id ?? ''
    expect(attended).not.toBe('')
  })

  // La que aguanta que la galeria d'una nit sigui d'aquella nit. pgTAP prova la
  // taula; això prova el bucket, que és on arriba el fitxer primer.
  it('lets somebody who was there upload, into their own folder only', async () => {
    const member = await as('alfa')
    const stamp = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`

    const own = await member.storage
      .from(BUCKET)
      .upload(`${attended}/${F.alfa}/${stamp}.jpg`, jpeg(), { contentType: 'image/jpeg' })
    expect(own.error).toBeNull()

    const other = await member.storage
      .from(BUCKET)
      .upload(`${attended}/${F.bravo}/${stamp}.jpg`, jpeg(), { contentType: 'image/jpeg' })
    expect(other.error).not.toBeNull()

    // I la seva, la pot esborrar.
    const gone = await member.storage.from(BUCKET).remove([`${attended}/${F.alfa}/${stamp}.jpg`])
    expect(gone.data?.length).toBe(1)
  })

  it('refuses a night somebody was not at', async () => {
    // `e4` és publicada i l'alfa no hi té cap fila: no hi va anar. Aquesta és la
    // que aguanta que la galeria d'una nit sigui d'aquella nit.
    const member = await as('alfa')
    const stamp = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`

    const denied = await member.storage
      .from(BUCKET)
      .upload(`${F.e4}/${F.alfa}/${stamp}.jpg`, jpeg(), { contentType: 'image/jpeg' })
    expect(denied.error).not.toBeNull()
  })

  it('cannot be written to by a pending profile at all', async () => {
    const pendent = await as('pendent_alfa')
    const stamp = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`

    const denied = await pendent.storage
      .from(BUCKET)
      .upload(`${attended}/${F.pendent}/${stamp}.jpg`, jpeg(), { contentType: 'image/jpeg' })
    expect(denied.error).not.toBeNull()
  })

  it('keeps who reported a photo away from whoever posted it', async () => {
    const member = await as('alfa')
    const insert = await member
      .from('photo_reports')
      .insert({ photo_id: F.e1, user_id: F.bravo, motiu: 'hi_surto' })

    // A nom d'un altre no, i llegir les dels altres tampoc.
    expect(insert.error).not.toBeNull()

    const { data, error } = await member.from('photo_reports').select('user_id')
    expect(error).toBeNull()
    expect(data?.every((r) => r.user_id === F.alfa)).toBe(true)
  })
})

describe('an avatar is yours to change and everybody else to look at', () => {
  // El bucket de la migració 42. Com el dels díptics, això només es pot provar
  // per l'API: signar una URL és una crida HTTP a storage, i
  // `storage.protect_delete()` refusa qualsevol DELETE directe, o sigui que la
  // política d'esborrat no s'executa mai des de pgTAP.
  //
  // I la diferència amb `door-photos` és el punt de tot el fitxer: un avatar
  // el veu tothom qui ja veu el nom de la persona, i una foto de porta no la
  // veu ni la junta. Les dues meitats van juntes al mateix `describe` perquè
  // una política massa ampla ha de fer fallar alguna cosa.
  const BUCKET = 'avatars'
  const body = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })

  // Un nom fresc a cada passada: la suite escriu a la mateixa base i no fa
  // rollback, i l'app tampoc no reemplaça mai un objecte —cada foto nova és un
  // fitxer nou amb la seva hora.
  const stamp = () => `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`

  it('lets you write into your own folder and nowhere else', async () => {
    const member = await as('alfa')

    const own = await member.storage
      .from(BUCKET)
      .upload(`${F.alfa}/${stamp()}.jpg`, body, { contentType: 'image/jpeg' })
    expect(own.error).toBeNull()

    const theirs = await member.storage
      .from(BUCKET)
      .upload(`${F.bravo}/${stamp()}.jpg`, body, { contentType: 'image/jpeg' })
    expect(theirs.error).not.toBeNull()

    // I un camí sense carpeta no és de ningú: `private.avatar_owner` torna
    // null i la política refusa, que és el que ha de fer un camí mal format.
    const loose = await member.storage
      .from(BUCKET)
      .upload(`${stamp()}.jpg`, body, { contentType: 'image/jpeg' })
    expect(loose.error).not.toBeNull()
  })

  it('and lets any active member sign it, because that is what a face is for', async () => {
    const owner = await as('bravo')
    const path = `${F.bravo}/${stamp()}.jpg`
    const up = await owner.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' })
    expect(up.error).toBeNull()

    // Qualsevol soci, i la junta. Un avatar que només es veu ell mateix no
    // serveix de res: surt al rànquing i a la llista de qui va a cada festa.
    for (const handle of ['alfa', 'junta_alfa']) {
      const other = await as(handle)
      const { data, error } = await other.storage.from(BUCKET).createSignedUrl(path, 60)
      expect(error).toBeNull()
      expect(data?.signedUrl).toContain(encodeURIComponent(BUCKET))
    }
  })

  it('but not somebody still waiting for approval, who is on no list yet', async () => {
    const owner = await as('charlie')
    const path = `${F.charlie}/${stamp()}.jpg`
    await owner.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' })

    // `is_active_member` i no `is_member_or_pending`: qui espera l'alta no surt
    // a cap llista, i per tant no hi ha res que la cara de ningú il·lustri.
    const pending = await as('pendent_alfa')
    const { data, error } = await pending.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(error).not.toBeNull()
    expect(data).toBeNull()

    // I no en pot pujar cap, tampoc a la seva carpeta.
    const up = await pending.storage
      .from(BUCKET)
      .upload(`${F.pendent}/${stamp()}.jpg`, body, { contentType: 'image/jpeg' })
    expect(up.error).not.toBeNull()
  })

  it('and only you can delete yours', async () => {
    const owner = await as('golf')
    const path = `${F.golf}/${stamp()}.jpg`
    await owner.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' })

    // Un esborrat refusat torna un resultat buit i no un error, com al díptic:
    // la prova és que l'objecte encara hi és.
    const other = await as('alfa')
    const refused = await other.storage.from(BUCKET).remove([path])
    expect(refused.data?.length ?? 0).toBe(0)

    const stillThere = await other.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(stillThere.error).toBeNull()

    const { data } = await owner.storage.from(BUCKET).remove([path])
    expect(data?.length).toBe(1)

    const gone = await owner.storage.from(BUCKET).createSignedUrl(path, 60)
    expect(gone.error).not.toBeNull()
  })
})

import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { anonClient, as, F, rpc, serviceClient } from './helpers'

interface CheckInResult {
  status: string
  replayed: boolean
  points_awarded: number
  was_registered: boolean
  checked_in_at: string | null
  nombre?: string
}

/** Undoes a check-in so each test starts from a known state. */
async function resetCheckIn(userId: string, eventId: string, estado: string | null) {
  const svc = serviceClient()
  await svc.from('points_log').delete().eq('user_id', userId).eq('event_id', eventId)
  if (estado === null) {
    await svc.from('attendances').delete().eq('user_id', userId).eq('event_id', eventId)
  } else {
    await svc.from('attendances').delete().eq('user_id', userId).eq('event_id', eventId)
    await svc.from('attendances').insert({ user_id: userId, event_id: eventId, estado })
  }
}

describe('check-in over HTTP', () => {
  beforeAll(async () => {
    await resetCheckIn(F.alfa, F.e1, 'si')
    await resetCheckIn(F.golf, F.e1, null)
    await resetCheckIn(F.bravo, F.e4, null)
  })

  it('a member cannot call it', async () => {
    const member = await as('alfa')
    const { error } = await member.rpc('check_in', { p_event_id: F.e1, p_user_id: F.alfa })
    expect(error).not.toBeNull()
  })

  it('anon is stopped by the grant, before the body runs', async () => {
    const { error } = await anonClient().rpc('check_in', { p_event_id: F.e1, p_user_id: F.alfa })
    expect(error).not.toBeNull()
  })

  it('user_metadata cannot buy admin', async () => {
    // The claim is writable by the user, so an authorisation check that read it
    // would hand out the points ledger. The role comes from the database.
    const member = await as('alfa')
    await member.auth.updateUser({ data: { role: 'admin', is_admin: true } })
    await member.auth.refreshSession()

    const { error } = await member.rpc('check_in', { p_event_id: F.e1, p_user_id: F.alfa })
    expect(error).not.toBeNull()
  })

  it('resending the offline queue neither duplicates points nor changes the verdict', async () => {
    const admin = await as('junta_alfa')
    const key = randomUUID()
    const args = { p_event_id: F.e1, p_user_id: F.alfa, p_client_request_id: key }

    const { data: first } = await rpc<CheckInResult>(admin, 'check_in', args)
    const { data: replay } = await rpc<CheckInResult>(admin, 'check_in', args)
    const { data: other } = await rpc<CheckInResult>(admin, 'check_in', {
      ...args,
      p_client_request_id: randomUUID(),
    })

    expect(first?.status).toBe('ok')
    expect(first?.points_awarded).toBe(10)

    expect(replay?.status).toBe('ok') // the original verdict, not a false amber
    expect(replay?.replayed).toBe(true)
    expect(replay?.points_awarded).toBe(0)

    // A different key for the same person is a genuine second scan.
    expect(other?.status).toBe('already_checked_in')
    expect(other?.points_awarded).toBe(0)

    // The first check-in time is the one that happened at the door.
    expect(replay?.checked_in_at).toBe(first?.checked_in_at)
    expect(other?.checked_in_at).toBe(first?.checked_in_at)

    const { data: ledger } = await serviceClient()
      .from('points_log')
      .select('id')
      .eq('user_id', F.alfa)
      .eq('event_id', F.e1)
      .eq('motivo', 'asistencia')
    expect(ledger).toHaveLength(1)
  })

  it('two admins scanning at the same instant award the points once', async () => {
    await resetCheckIn(F.alfa, F.e1, 'si')
    const [a, b] = await Promise.all([as('junta_alfa'), as('junta_bravo')])
    const base = { p_event_id: F.e1, p_user_id: F.alfa }

    const [r1, r2] = await Promise.all([
      rpc<CheckInResult>(a, 'check_in', { ...base, p_client_request_id: randomUUID() }),
      rpc<CheckInResult>(b, 'check_in', { ...base, p_client_request_id: randomUUID() }),
    ])

    const statuses = [r1.data?.status, r2.data?.status].sort()
    expect(statuses).toEqual(['already_checked_in', 'ok'])

    const { data: ledger } = await serviceClient()
      .from('points_log')
      .select('id')
      .eq('user_id', F.alfa)
      .eq('event_id', F.e1)
      .eq('motivo', 'asistencia')
    expect(ledger).toHaveLength(1)
  })

  it('a walk-in at a free, unlimited event is green', async () => {
    const admin = await as('junta_alfa')
    const { data } = await rpc<CheckInResult>(admin, 'check_in', {
      p_event_id: F.e1,
      p_user_id: F.golf,
    })

    expect(data?.status).toBe('ok_walkin')
    expect(data?.was_registered).toBe(false)
  })

  it('a walk-in at an event with places or a price is amber, and still gets in', async () => {
    const admin = await as('junta_alfa')
    const { data } = await rpc<CheckInResult>(admin, 'check_in', {
      p_event_id: F.e4,
      p_user_id: F.bravo,
    })

    expect(data?.status).toBe('ok_walkin_review')
    expect(data?.was_registered).toBe(false)
    expect(data?.points_awarded).toBeGreaterThan(0)
  })

  it('the roster hands out hashes, never tokens', async () => {
    // A junta phone left on a table must not leak 300 forgeable check-in
    // credentials, so the scanner matches sha256 digests offline.
    const admin = await as('junta_alfa')
    const { data: rows, error } = await rpc<{ token_sha256: string; nombre: string }[]>(
      admin,
      'checkin_roster',
      { p_event_id: F.e1 },
    )

    expect(error).toBeNull()
    expect(rows?.length).toBeGreaterThan(0)
    expect(rows?.[0]?.token_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rows)).not.toMatch(/qr_token/)
  })

  it('a member cannot pull the roster', async () => {
    const member = await as('alfa')
    const { data, error } = await rpc<unknown[]>(member, 'checkin_roster', {
      p_event_id: F.e1,
    })
    // is_admin() is false, so the set-returning function yields nothing rather
    // than raising. Either shape is a refusal; neither leaks a token.
    expect(error ?? data).toEqual([])
  })
})

describe('the signup path', () => {
  it('creates a profile that is pending and ordinary, whatever the client claims', async () => {
    // raw_user_meta_data is entirely client-controlled. Anyone can send
    // {"role":"owner"} at signup; the trigger must ignore it.
    const email = `newcomer-${randomUUID()}@example.test`
    const anon = anonClient()
    const { data: signUp, error } = await anon.auth.signUp({
      email,
      password: 'test-password-0000',
      options: { data: { nombre: 'Newcomer', role: 'owner', estat: 'actiu' } },
    })

    expect(error).toBeNull()
    const id = signUp.user?.id
    expect(id).toBeTruthy()

    const { data: profile } = await serviceClient()
      .from('profiles')
      .select('role, estat, nombre')
      .eq('id', id!)
      .single()

    expect(profile?.role).toBe('member')
    expect(profile?.estat).toBe('pendent')
    expect(profile?.nombre).toBe('Newcomer')
  })

  it('and the invitation is what turns pending into a member', async () => {
    const pending = await as('pendent_alfa')

    const before = await serviceClient()
      .from('profiles')
      .select('estat')
      .eq('id', F.pendent)
      .single()
    expect(before.data?.estat).toBe('pendent')

    const { data, error } = await rpc<{ ok: boolean }>(pending, 'redeem_invite', {
      p_codi: 'CODI-VALID-0001',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ ok: true })

    const after = await serviceClient()
      .from('profiles')
      .select('estat')
      .eq('id', F.pendent)
      .single()
    expect(after.data?.estat).toBe('actiu')

    await serviceClient().from('profiles').update({ estat: 'pendent' }).eq('id', F.pendent)
    await serviceClient().from('invite_uses').delete().eq('user_id', F.pendent)
  })

  it('fixture users can sign in — the canary for GoTrue schema drift', async () => {
    // Seeding auth.users by hand couples us to GoTrue's internals. When a CLI
    // bump changes them, this fails first and says why, instead of forty
    // unrelated tests failing mysteriously.
    const client = anonClient()
    const { error } = await client.auth.signInWithPassword({
      email: 'alfa@example.test',
      password: 'test-password-0000',
    })
    expect(error).toBeNull()
  })
})

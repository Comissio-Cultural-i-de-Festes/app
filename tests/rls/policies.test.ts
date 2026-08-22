import { describe, expect, it } from 'vitest'

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
      // Named, not select(). See the contract test below.
      .select('id, hide_from_ranking')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('select(*) on profiles is denied, and that is the contract', async () => {
    // qr_token and telefon are revoked at the column level, and PostgREST
    // expands * to every column, so `select('*')` on this table is a 42501 for
    // a member. Screens must name the columns they want. This is asserted
    // rather than documented because the first person to hit it will be
    // tempted to "fix" it by handing the grants back.
    const member = await as('alfa')
    const { error } = await member.from('profiles').select('*').limit(1)
    expect(error?.code).toBe('42501')

    const { error: named } = await member
      .from('profiles')
      .select('id, nombre, escola, curs, role, estat')
      .limit(1)
    expect(named).toBeNull()
  })

  it('a QR token is not readable off the table, only through my_qr()', async () => {
    const member = await as('alfa')

    const { error } = await member.from('profiles').select('qr_token').eq('id', F.bravo)
    expect(error?.code).toBe('42501')

    const { data: mine, error: mineErr } = await rpc<string>(member, 'my_qr')
    expect(mineErr).toBeNull()
    expect(mine).toMatch(/^[0-9a-f-]{36}$/)
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
    expect(data?.descripcion).toBeNull()
    expect(data?.ubicacion).toBeNull()
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
    const member = await as('alfa')
    const { count } = await member
      .from('attendances')
      .select('*', { count: 'exact', head: true })
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
    for (const table of ['profiles', 'events', 'attendances', 'points_log', 'ranking']) {
      const { error } = await anon.from(table).select('*').limit(1)
      expect(error, `anon could read ${table}`).not.toBeNull()
    }
  })

  it('may check an invitation code, and gets the same answer for invalid and spent', async () => {
    const anon = anonClient()
    interface Preview {
      valid: boolean
    }
    const valid = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'CODI-VALID-0001' })
    const revoked = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'CODI-REVOCAT-02' })
    const missing = await rpc<Preview>(anon, 'invite_preview', { p_codi: 'NO-EXISTEIX' })

    expect(valid.data).toEqual({ valid: true })
    expect(revoked.data).toEqual({ valid: false })
    // Identical, so a code cannot be probed for having once existed.
    expect(missing.data).toEqual(revoked.data)
  })

  it('cannot redeem one', async () => {
    const { error } = await anonClient().rpc('redeem_invite', { p_codi: 'CODI-VALID-0001' })
    expect(error).not.toBeNull()
  })
})

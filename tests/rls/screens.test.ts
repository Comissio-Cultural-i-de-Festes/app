import { beforeAll, describe, expect, it } from 'vitest'

import { type Client, as } from './helpers'

/**
 * The shapes the home and ranking screens actually receive.
 *
 * These are not policy tests. They are here because this is the only layer
 * that goes through PostgREST, and everything asserted below is a fact about
 * PostgREST that no amount of SQL can show: whether an embedded row arrives as
 * an object or an array, whether an RPC's columns are named what the caller
 * thinks, whether a filter on a view is applied before or after the policy.
 *
 * Getting the embed shape wrong is silent. `row.profiles?.nombre` on an array
 * is `undefined`, so the avatars render as placeholders and the "s'han apuntat
 * avui" line simply never appears — with no error anywhere.
 */

const EVENT_REVEALED = '00000000-0000-4000-8000-0000000000e1'

let member: Client

beforeAll(async () => {
  member = await as('alfa')
})

describe('the home screen queries', () => {
  it('embeds the profile as one object, not a list of one', async () => {
    // Named foreign key, not a bare `profiles(...)`: attendances points at
    // profiles twice, so PostgREST refuses to guess and returns PGRST201.
    //
    // One string literal, not a concatenation: supabase-js reads the select
    // list at the type level, and anything it cannot see as a literal falls
    // back to an unknown row shape.
    const { data, error } = await member
      .from('attendances')
      .select(
        'user_id, event_id, estado, created_at, profiles!attendances_user_id_fkey(nombre, avatar_url)',
      )
      .eq('event_id', EVENT_REVEALED)

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)

    const row = data?.[0]
    expect(Array.isArray(row?.profiles)).toBe(false)
    expect(typeof row?.profiles?.nombre).toBe('string')
  })

  it('embeds no profile a member is not allowed to read', async () => {
    // The embed follows a foreign key, and a foreign key is not a licence: the
    // join is still subject to the policies on profiles. If that ever stops
    // being true, the ranking's hide_from_ranking filter is bypassable by
    // asking for attendances instead.
    const { data, error } = await member
      .from('attendances')
      .select('estado, profiles!attendances_user_id_fkey(nombre)')
      .eq('event_id', EVENT_REVEALED)

    expect(error).toBeNull()
    expect(data?.every((r) => r.estado === 'si' || r.estado === 'asistio')).toBe(true)
  })

  it('lists upcoming published events with their detail columns', async () => {
    const { data, error } = await member
      .from('events_public')
      .select('id, titulo, starts_at, revelat, plazas, descripcion, ubicacion')
      .eq('published', true)
      .gte('starts_at', new Date(Date.now() - 6 * 3_600_000).toISOString())
      .order('starts_at', { ascending: true })

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)

    // The screen reads `revelat` and expects the detail columns to be absent
    // rather than blanked by a CASE. Both halves have to hold.
    const hidden = data?.find((e) => e.revelat === false)
    expect(hidden).toBeDefined()
    expect(hidden?.descripcion).toBeNull()
    expect(hidden?.ubicacion).toBeNull()

    const shown = data?.find((e) => e.revelat === true)
    expect(shown?.descripcion).not.toBeNull()
  })

  it('finds something that already happened, for the recap', async () => {
    const { data, error } = await member
      .from('events_public')
      .select('id, titulo, puntos')
      .eq('published', true)
      .lt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: false })
      .limit(1)

    expect(error).toBeNull()
    expect(data?.[0]?.titulo).toBeTruthy()
  })
})

describe('answering from the home screen', () => {
  // A member and an event that no other file in this suite touches, so this
  // one can write without moving the ground under the others.
  const EVENT = '00000000-0000-4000-8000-0000000000e6'

  it('saves an answer and then changes it, in one row', async () => {
    const hotel = await as('hotel')

    const first = await hotel.rpc('set_attendance', { p_event_id: EVENT, p_estado: 'si' })
    expect(first.error).toBeNull()

    const second = await hotel.rpc('set_attendance', { p_event_id: EVENT, p_estado: 'potser' })
    expect(second.error).toBeNull()

    const { data } = await hotel
      .from('attendances')
      .select('estado')
      .eq('event_id', EVENT)
      .eq('user_id', (await hotel.auth.getUser()).data.user?.id ?? '')

    expect(data).toEqual([{ estado: 'potser' }])
  })

  it('is why the obvious upsert is not used: PostgREST writes every column', async () => {
    // This is the bug the screen shipped with for an afternoon. `.upsert()`
    // generates `on conflict do update set user_id = …, event_id = …, estado =
    // …` — the whole body — and the client is granted UPDATE on `estado`
    // alone, because moving your row onto somebody else's user_id is exactly
    // what the column grants exist to stop. Privileges are checked before
    // policies, so it fails with 42501 and no policy is ever consulted.
    //
    // Pinned here rather than only fixed, because `.upsert()` is what anybody
    // would reach for next time and nothing else in the build would object.
    const hotel = await as('hotel')
    const userId = (await hotel.auth.getUser()).data.user?.id ?? ''

    const { error } = await hotel
      .from('attendances')
      .upsert(
        { user_id: userId, event_id: EVENT, estado: 'si' },
        { onConflict: 'user_id,event_id' },
      )

    expect(error?.code).toBe('42501')
  })

  it('refuses to mark somebody as having attended', async () => {
    const hotel = await as('hotel')
    const { error } = await hotel.rpc('set_attendance', {
      p_event_id: EVENT,
      p_estado: 'asistio',
    })

    expect(error).not.toBeNull()
  })

  it('refuses to answer on somebody else’s behalf', async () => {
    // There is no parameter for whose answer it is, which is the point: the
    // function reads auth.uid() and there is nothing to tamper with.
    const hotel = await as('hotel')
    const { error } = await hotel.from('attendances').insert({
      user_id: '00000000-0000-4000-8000-000000000001',
      event_id: EVENT,
      estado: 'si',
    })

    expect(error).not.toBeNull()
  })
})

describe('the ranking screen queries', () => {
  it('returns the periods the chips are drawn from', async () => {
    const { data, error } = await member
      .from('ranking_periods')
      .select('codi, etiqueta, starts_at, ends_at, ordre')
      .order('ordre')

    expect(error).toBeNull()
    expect(data?.map((p) => p.codi)).toContain('curs')
    // The screen treats the first row as the default, so the order matters as
    // much as the contents.
    expect(data?.[0]?.codi).toBe('curs')
  })

  it('returns the ranking with the column names the screen reads', async () => {
    const { data, error } = await member.rpc('ranking_period', {})

    expect(error).toBeNull()
    const row = data?.[0]
    expect(row).toMatchObject({
      user_id: expect.any(String) as unknown,
      nombre: expect.any(String) as unknown,
      punts: expect.any(Number) as unknown,
      posicio: expect.any(Number) as unknown,
    })
  })

  it('windows the ranking when given bounds, without dropping anybody', async () => {
    const all = await member.rpc('ranking_period', {})
    const lastWeek = await member.rpc('ranking_period', {
      p_from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    })

    expect(lastWeek.error).toBeNull()
    // Same people, different totals. Anyone missing here would be a member who
    // scored nothing this week, which is precisely who the window is for.
    expect(lastWeek.data?.length).toBe(all.data?.length)
    expect(lastWeek.data?.reduce((n, r) => n + r.punts, 0)).toBeLessThan(
      all.data?.reduce((n, r) => n + r.punts, 0) ?? 0,
    )
  })

  it('returns schools with the member and event counts the row shows', async () => {
    const { data, error } = await member.rpc('ranking_escoles_period', {})

    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    const row = data?.[0]
    expect(row).toMatchObject({
      escola: expect.any(String) as unknown,
      membres: expect.any(Number) as unknown,
      esdeveniments: expect.any(Number) as unknown,
      punts_totals: expect.any(Number) as unknown,
      posicio: expect.any(Number) as unknown,
    })
  })

  it('refuses the ranking to somebody who is not a member yet', async () => {
    // A pending profile has a valid session, so this is a live path, not a
    // hypothetical: the screens have to cope with an empty board rather than
    // an error, and the board has to be empty rather than full.
    const pending = await as('pendent_alfa')
    const { data, error } = await pending.rpc('ranking_period', {})

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

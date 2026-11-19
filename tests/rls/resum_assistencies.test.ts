import { beforeAll, describe, expect, it } from 'vitest'

import { type Client, anonClient, as, F, rpc } from './helpers'

/**
 * `resum_assistencies()` a través de PostgREST, amb un token de debò.
 *
 * La prova de veritat és la comparació: per a cada persona, el resum ha de dir
 * exactament el que el client en treia abans llegint les files d'`attendances`
 * amb el perfil incrustat —la consulta que l'Inici feia fins ara—, amb el
 * mateix token i en el mateix moment. Com que la base no es desfà entre
 * execucions i altres fitxers hi escriuen, no s'hi escriu cap número a mà: el
 * que es compara és una lectura amb l'altra.
 */

interface Face {
  readonly user_id: string
  readonly avatar_url: string | null
  readonly created_at: string
}
interface Summary {
  readonly event_id: string
  readonly going: number
  readonly attended: number
  readonly mine: string | null
  readonly mine_at: string | null
  readonly faces: readonly Face[]
  readonly recent_total: number
  readonly recent: readonly string[]
}

const EVENTS = [
  F.e1,
  F.e2,
  F.e3,
  F.e4,
  '00000000-0000-4000-8000-0000000000e5',
  '00000000-0000-4000-8000-0000000000e9', // reunió de junta
  '00000000-0000-4000-8000-0000000000ea',
]

// Un sol instant per a la crida i per a la comparació: «des de quan» ha de ser
// el mateix a totes dues bandes, o la vora es mou entre l'una i l'altra.
const DESDE = new Date(Date.now() - 26 * 3_600_000).toISOString()

async function summaries(client: Client): Promise<Summary[]> {
  const { data, error } = await rpc<Summary[]>(client, 'resum_assistencies', {
    p_event_ids: EVENTS,
    p_desde: DESDE,
  })
  expect(error).toBeNull()
  return [...(data ?? [])].sort((a, b) => a.event_id.localeCompare(b.event_id))
}

/** El que el client comptava amb les files, com ho comptava. */
async function fromRows(client: Client) {
  const me = (await client.auth.getUser()).data.user?.id ?? ''
  const { data, error } = await client
    .from('attendances')
    .select(
      'user_id, event_id, estado, created_at, profiles!attendances_user_id_fkey(nombre, avatar_url)',
    )
    .in('event_id', EVENTS)
  expect(error).toBeNull()
  const rows = data ?? []
  const newestFirst = (
    a: { created_at: string; user_id: string },
    b: { created_at: string; user_id: string },
  ) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.user_id.localeCompare(b.user_id)

  return [...EVENTS].sort().map((id) => {
    const here = rows.filter((r) => r.event_id === id)
    const going = here.filter((r) => r.estado === 'si' || r.estado === 'asistio').sort(newestFirst)
    return {
      event_id: id,
      going: going.length,
      attended: here.filter((r) => r.estado === 'asistio').length,
      mine: here.find((r) => r.user_id === me)?.estado ?? null,
      faces: going.slice(0, 5).map((r) => [r.user_id, r.profiles?.avatar_url ?? null]),
      ...(() => {
        const recent = going.filter(
          (r) =>
            r.user_id !== me &&
            Date.parse(r.created_at) >= Date.parse(DESDE) &&
            (r.profiles?.nombre ?? '') !== '',
        )
        return {
          recent_total: recent.length,
          recent: recent.slice(0, 2).map((r) => r.profiles?.nombre),
        }
      })(),
    }
  })
}

function comparable(list: readonly Summary[]) {
  return list.map((s) => ({
    event_id: s.event_id,
    going: s.going,
    attended: s.attended,
    mine: s.mine,
    faces: s.faces.map((f) => [f.user_id, f.avatar_url]),
    recent_total: s.recent_total,
    recent: s.recent,
  }))
}

describe('resum_assistencies', () => {
  let member: Client
  let pending: Client
  let gone: Client
  let junta: Client

  beforeAll(async () => {
    member = await as('alfa')
    pending = await as('pendent_alfa')
    gone = await as('baixa_alfa')
    junta = await as('junta_alfa')
  })

  it.each([
    ['soci actiu', () => member],
    ['pendent', () => pending],
    ['baixa', () => gone],
    ['junta', () => junta],
  ])('%s: diu el mateix que les files que llegia el client', async (_who, client) => {
    const [summary, rows] = await Promise.all([summaries(client()), fromRows(client())])
    expect(comparable(summary)).toEqual(rows)
  })

  it('un soci actiu hi veu gent, i la reunió de junta buida', async () => {
    const list = await summaries(member)
    expect(list.some((s) => s.going > 0 && s.faces.length > 0)).toBe(true)
    expect(list.find((s) => s.event_id.endsWith('e9'))?.going).toBe(0)
  })

  it('un pendent no veu cap cara ni cap nom dels altres', async () => {
    const me = (await pending.auth.getUser()).data.user?.id
    const list = await summaries(pending)
    expect(list.flatMap((s) => s.faces).every((f) => f.user_id === me)).toBe(true)
    expect(list.flatMap((s) => s.recent)).toEqual([])
  })

  it('la junta compta també la reunió de junta', async () => {
    const list = await summaries(junta)
    expect(list.find((s) => s.event_id.endsWith('e9'))?.going).toBeGreaterThan(0)
  })

  it('anon no la pot cridar', async () => {
    const { error } = await rpc(anonClient(), 'resum_assistencies', {
      p_event_ids: EVENTS,
      p_desde: DESDE,
    })
    expect(error?.code).toBe('42501')
  })

  it('més de cinquanta esdeveniments és 22023', async () => {
    const many = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    const { error } = await rpc(member, 'resum_assistencies', { p_event_ids: many, p_desde: DESDE })
    expect(error?.code).toBe('22023')
  })

  it('una cara és id, foto i hora, i dels noms només n’arriben dos: res més', async () => {
    const list = await summaries(junta)
    for (const s of list) {
      for (const f of s.faces)
        expect(Object.keys(f).sort()).toEqual(['avatar_url', 'created_at', 'user_id'])
      expect(s.recent.length).toBeLessThanOrEqual(2)
      for (const r of s.recent) expect(typeof r).toBe('string')
    }
  })

  it('pesa menys que les files que substitueix', async () => {
    const { data: rows } = await member
      .from('attendances')
      .select(
        'user_id, event_id, estado, created_at, profiles!attendances_user_id_fkey(nombre, avatar_url)',
      )
      .in('event_id', EVENTS)
    const list = await summaries(member)
    expect(JSON.stringify(list).length).toBeLessThan(JSON.stringify(rows).length)
  })

  it('el que escriu set_attendance es veu a la crida següent', async () => {
    // Torna a «potser» al final, que és com el deixa també screens.test.ts:
    // la prova es pot tornar a executar sense desfer res.
    const hotel = await as('hotel')
    const ask = async () =>
      (
        await rpc<Summary[]>(hotel, 'resum_assistencies', {
          p_event_ids: [F.e1],
          p_desde: DESDE,
        })
      ).data?.[0]

    await hotel.rpc('set_attendance', { p_event_id: F.e1, p_estado: 'potser' })
    const before = await ask()
    expect(before?.mine).toBe('potser')

    await hotel.rpc('set_attendance', { p_event_id: F.e1, p_estado: 'si' })
    const after = await ask()
    expect(after?.mine).toBe('si')
    expect(after?.going).toBe((before?.going ?? 0) + 1)
    expect(after?.mine_at).toBe(before?.mine_at)

    await hotel.rpc('set_attendance', { p_event_id: F.e1, p_estado: 'potser' })
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Els TIPUS s'importen aquí i els VALORS dins del `beforeAll`, com a
// `junta_ajust.test.ts`: el client de l'app no es pot carregar fins que les
// variables `VITE_*` apuntin a aquest stack.
import type * as Api from '../../src/features/home/api'
import type * as Finestra from '../../src/features/home/finestra'

import { F, serviceClient, stack } from './helpers'

/**
 * L'Inici d'un soci amb una casa rural a mig fer, per PostgREST.
 *
 * Els filtres de `home/finestra.ts` són un `or` amb un `and` a dins i dates
 * entre cometes, que és sintaxi de PostgREST i no de SQL: la prova unitària
 * en comprova el text i aquí es comprova que PostgREST els entén i tria el
 * que han de triar, a través de la vista que llegeix l'Inici i amb el token
 * d'un soci.
 *
 * Tres esdeveniments d'aquest fitxer, tots relatius a l'horitzó de la clau de
 * cau i no al rellotge, perquè el canvi d'hora a mitja prova no en mogui cap:
 *
 *   L'estada, començada fa vuit hores i que acaba d'aquí a dos dies. És el cas
 *   de la issue: ha de ser a dalt i no a «L'última vegada».
 *   Una festa sense final començada fa vuit hores: les sis hores de sempre,
 *   que la treuen de dalt.
 *   Una festa amb final que ja ha arribat, començada fa menys de sis hores: el
 *   final mana, com a la fitxa.
 *
 * Identificadors fixos i `upsert`, perquè aquesta suite no desfà res i la
 * passada d'ahir no ha de deixar res mort; i se'n van al final, perquè
 * l'estada seria el hero de tothom qui obrís l'Inici en aquesta base.
 */

const ESTADA = '00000000-0000-4000-8000-00000000ec01'
const SENSE_FINAL = '00000000-0000-4000-8000-00000000ec02'
const JA_ACABADA = '00000000-0000-4000-8000-00000000ec03'
const IDS = [ESTADA, SENSE_FINAL, JA_ACABADA]

const HOUR = 3_600_000
const DAY = 24 * HOUR

let api: typeof Api
let finestra: typeof Finestra
let horizon: string

beforeAll(async () => {
  process.env.VITE_SUPABASE_URL = stack.apiUrl
  process.env.VITE_SUPABASE_ANON_KEY = stack.anonKey
  process.env.VITE_APP_NAME ??= 'Associació de Proves'
  process.env.VITE_APP_SHORT_NAME ??= 'proves.'

  api = await import('../../src/features/home/api')
  finestra = await import('../../src/features/home/finestra')
  horizon = api.horizonIso()
  const h = Date.parse(horizon)
  const ara = h + 6 * HOUR
  const iso = (ms: number) => new Date(ms).toISOString()

  const fixtures = [
    { id: ESTADA, tipo: 'casa_rural', starts: h - 2 * HOUR, ends: ara + 2 * DAY },
    { id: SENSE_FINAL, tipo: 'fiesta', starts: h - 2 * HOUR, ends: null },
    { id: JA_ACABADA, tipo: 'fiesta', starts: h + HOUR, ends: ara - 60_000 },
  ] as const

  const svc = serviceClient()
  const events = await svc
    .from('events')
    .upsert(
      fixtures.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        starts_at: iso(f.starts),
        reveal_at: null,
        plazas: null,
        precio_cents: 0,
        puntos: 10,
        published: true,
        created_by: F.juntaAlfa,
      })),
      { onConflict: 'id' },
    )
    .select('id')
  expect(events.error).toBeNull()
  expect(events.data).toHaveLength(fixtures.length)

  const titles = await svc.from('event_title').upsert(
    fixtures.map((f) => ({ event_id: f.id, titulo: `Inventat ${f.id.slice(-2)}` })),
    { onConflict: 'event_id' },
  )
  expect(titles.error).toBeNull()

  const details = await svc.from('event_details').upsert(
    fixtures.map((f) => ({ event_id: f.id, ends_at: f.ends === null ? null : iso(f.ends) })),
    { onConflict: 'event_id' },
  )
  expect(details.error).toBeNull()

  const { supabase } = await import('../../src/lib/supabase')
  const entrada = await supabase.auth.signInWithPassword({
    email: 'alfa@example.test',
    password: 'test-password-0000',
  })
  if (entrada.error) throw entrada.error
})

afterAll(async () => {
  await serviceClient().from('events').delete().in('id', IDS)
})

/** Quins dels tres tria un filtre, llegint la vista de l'Inici com a soci. */
async function triats(filtre: string): Promise<(string | null)[]> {
  const { supabase } = await import('../../src/lib/supabase')
  const { data, error } = await supabase
    .from('events_public')
    .select('id')
    .eq('published', true)
    .in('id', IDS)
    .or(filtre)
  expect(error).toBeNull()
  return (data ?? []).map((r) => r.id).sort()
}

describe('dalt de l’Inici', () => {
  it('l’estada que va començar fa vuit hores i encara dura dos dies hi és', async () => {
    expect(await triats(finestra.alCartell(horizon))).toEqual([ESTADA])
  })

  it('i fetchUpcoming la porta, per la mateixa porta que l’app', async () => {
    const upcoming = await api.fetchUpcoming(horizon, 1000)
    const ids = upcoming.map((e) => e.id)
    expect(ids).toContain(ESTADA)
    expect(ids).not.toContain(SENSE_FINAL)
    expect(ids).not.toContain(JA_ACABADA)
  })
})

describe('«L’última vegada»', () => {
  it('té les altres dues i no l’estada, perquè cap no surti a tots dos llocs', async () => {
    expect(await triats(finestra.jaHiVamSer(horizon))).toEqual([SENSE_FINAL, JA_ACABADA].sort())
  })

  it('i fetchPrevious no torna l’estada', async () => {
    const previous = await api.fetchPrevious(horizon)
    expect(previous.map((e) => e.id)).not.toContain(ESTADA)
  })
})

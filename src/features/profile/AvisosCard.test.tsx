import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type * as AvisosApi from '@/features/junta/avisosApi'
import { formatDayMonth, formatMonthYear } from '@/i18n/format'

import { AvisosCard } from './AvisosCard'

/**
 * Dos avisos separats exactament un any no es poden pintar iguals.
 *
 * EL CAS ÉS EL DE L'ISSUE, no un de fàcil. La targeta fita la lectura a la
 * finestra del curs i la seva prosa en deia que amb això la data ja no podia
 * ser ambigua. La finestra és `[des_de, ∞)` —el període `global` no té mai
 * final, `periodsFromChain` hi escriu `ends_at: null`— o sigui que un `des_de`
 * que ningú no ha mogut al setembre deixa passar dos novembres, i amb «4 de
 * nov.» a la columna els dos surten idèntics. Les dues files d'aquí sota són
 * aquell parell, i la primera asserció ho diu amb totes les lletres: sense
 * l'any, les dues dates són la mateixa cadena.
 *
 * LES DATES ES CALCULEN DES D'AVUI i no s'escriuen a mà. La regla és d'un any
 * i el rellotge de veritat: amb dates fixes, aquest fitxer voldria dir una
 * cosa diferent cada any que passés, i el dia que deixés de mossegar no ho
 * diria ningú. Els rellotges falsos de vitest no serveixen aquí —React Query
 * resol amb temporitzadors i `findBy*` s'hi queda penjat.
 *
 * Gent i fets inventats, com a tot el repo.
 */

/** Migdia, perquè restar un any no travessi cap canvi d'hora ni cap mitjanit. */
function faDies(dies: number): Date {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - dies)
  return d
}

const NOU = faDies(90)
const VELL = new Date(NOU.getTime())
VELL.setFullYear(VELL.getFullYear() - 1)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

vi.mock('@/features/ranking/useRanking', () => ({
  // `fins_a` null a posta: és el que la pantalla dels períodes escriu sempre.
  // I un `des_de` vell, que és el cas —el setembre que ningú no toca les dates.
  useCurs: () => ({ des_de: '2020-09-01T00:00:00Z', fins_a: null, llest: true }),
}))

vi.mock('@/features/junta/avisosApi', async (original) => {
  const real = await original<typeof AvisosApi>()
  return {
    ...real,
    fetchAvisos: () => Promise.resolve(FILES),
    fetchAvisTipus: () => Promise.resolve([]),
  }
})

const SOCI = '00000000-0000-4000-8000-0000000000a1'

const FILES: AvisosApi.AvisRow[] = [
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    user_id: SOCI,
    tipus: 'greu',
    gravetat: 3,
    nota: 'Va deixar la sala oberta',
    event_id: null,
    created_at: NOU.toISOString(),
    retirat_at: null,
    retirat_nota: null,
    points_log: { puntos: -25 },
  },
  {
    id: '00000000-0000-4000-8000-0000000000b3',
    user_id: SOCI,
    tipus: 'greu',
    gravetat: 3,
    nota: 'Se’n va anar amb les claus',
    event_id: null,
    created_at: VELL.toISOString(),
    retirat_at: null,
    retirat_nota: null,
    points_log: { puntos: -25 },
  },
]

function munta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AvisosCard userId={SOCI} />
    </QueryClientProvider>,
  )
}

describe('AvisosCard', () => {
  it('no pinta el mateix per a dos avisos separats un any just', async () => {
    // El forat, dit primer: amb dia i mes sols, les dues files són la mateixa
    // cadena. Si això deixés de ser cert, la prova de sota seria vàcua.
    expect(formatDayMonth(NOU, 'ca')).toBe(formatDayMonth(VELL, 'ca'))

    munta()
    await screen.findByText('Va deixar la sala oberta')

    expect(screen.getByText(formatDayMonth(NOU, 'ca'))).toBeInTheDocument()
    expect(screen.getByText(formatMonthYear(VELL, 'ca'))).toBeInTheDocument()
    // I només una: si les dues filessin amb dia i mes, n'hi hauria dues.
    expect(screen.queryAllByText(formatDayMonth(NOU, 'ca'))).toHaveLength(1)
  })
})

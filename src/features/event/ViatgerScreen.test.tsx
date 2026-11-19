import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { UserIdContext } from '@/features/session/context'

import { ViatgerBlock } from './ViatgerBlock'
import { ViatgerScreen } from './ViatgerScreen'
import type * as HomeApi from '@/features/home/api'

import type * as EventApi from './api'
import type { MevesDades } from './viatgerApi'
import type * as ViatgerApi from './viatgerApi'

/**
 * Un mòbil compartit no ha de passar les dades de viatger d'una persona a la
 * següent.
 *
 * EL CAS. A obre el formulari, desa i tanca la sessió; B entra a la mateixa
 * pestanya, sense recarregar, i obre el mateix formulari. Amb la clau de la
 * consulta sense la persona i la cau de trenta minuts, B veia el número de
 * document d'A —i, si premia «Desa», el desava com a seu—. Aquí la sessió no es
 * tanca: es prova la cosa que no ha de dependre que algú se'n recordi de
 * buidar la cau, que és que el que és d'A no es quedi a la cau quan A ja no hi
 * és, i que el que es demana per a B sigui de B.
 *
 * I EL BLOC DE LA FITXA NO BAIXA LES DADES: només si hi són i quan es van
 * tocar. És el que es carrega cada cop que algú obre un esdeveniment.
 *
 * Persones i documents inventats.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

const EVENT = '00000000-0000-4000-8000-0000000064e1'
const A = '00000000-0000-4000-8000-0000000000aa'
const B = '00000000-0000-4000-8000-0000000000bb'

const DADES_A: MevesDades = {
  nom: 'Persona',
  cognom1: 'Inventada',
  cognom2: null,
  sexe: 'dona',
  tipus_document: 'dni',
  numero_document: '12345678Z',
  numero_suport: 'ABC123456',
  nacionalitat: 'ES',
  data_naixement: '2003-04-05',
  adreca: 'Via Inventada 1',
  localitat: 'Poble Alfa',
  pais: 'ES',
  telefon_emergencia: '955000001',
  updated_at: '2026-11-18T10:00:00Z',
}

const fetchMevesDades = vi.fn((_e: string, user: string) =>
  Promise.resolve(user === A ? DADES_A : null),
)
const fetchMevaMarca = vi.fn((_e: string, user: string) =>
  Promise.resolve(user === A ? { updated_at: DADES_A.updated_at } : null),
)

vi.mock('./viatgerApi', async (original) => {
  const real = await original<typeof ViatgerApi>()
  return {
    ...real,
    fetchDemanaViatger: () => Promise.resolve(true),
    fetchMevesDades: (e: string, u: string) => fetchMevesDades(e, u),
    fetchMevaMarca: (e: string, u: string) => fetchMevaMarca(e, u),
  }
})

vi.mock('./api', async (original) => {
  const real = await original<typeof EventApi>()
  return {
    ...real,
    fetchEvent: () =>
      Promise.resolve({
        id: EVENT,
        titulo: 'Casa de prova',
        tipo: 'casa_rural',
        starts_at: new Date(Date.now() + 5 * 864e5).toISOString(),
        ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      }),
  }
})

vi.mock('@/features/home/api', async (original) => {
  const real = await original<typeof HomeApi>()
  return {
    ...real,
    fetchAttendances: () =>
      Promise.resolve([
        { user_id: A, event_id: EVENT, estado: 'si', created_at: '2026-11-01T00:00:00Z' },
        { user_id: B, event_id: EVENT, estado: 'si', created_at: '2026-11-01T00:00:00Z' },
      ]),
  }
})

function obre(client: QueryClient, user: string, el: React.ReactNode) {
  return render(
    <QueryClientProvider client={client}>
      <UserIdContext.Provider value={user}>
        <MemoryRouter initialEntries={[`/esdeveniment/${EVENT}/viatger`]}>
          <Routes>
            <Route path="/esdeveniment/:id/viatger" element={el} />
          </Routes>
        </MemoryRouter>
      </UserIdContext.Provider>
    </QueryClientProvider>,
  )
}

function cauAmb(client: QueryClient, text: string): boolean {
  return client
    .getQueryCache()
    .getAll()
    .some((q) => JSON.stringify(q.state.data ?? null).includes(text))
}

describe('les dades de viatger en un mòbil compartit', () => {
  it("B no veu el que A va obrir, i quan A se'n va la cau no ho guarda", async () => {
    const client = new QueryClient()
    const a = obre(client, A, <ViatgerScreen />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('12345678Z')).toBeInTheDocument()
    })
    a.unmount()

    await waitFor(() => {
      expect(cauAmb(client, '12345678Z')).toBe(false)
    })

    obre(client, B, <ViatgerScreen />)
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'viatger.field.nom' })).toBeInTheDocument()
    })
    expect(screen.queryByDisplayValue('12345678Z')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'viatger.field.nom' })).toHaveValue('')
    expect(fetchMevesDades).toHaveBeenLastCalledWith(EVENT, B)
  })

  it('el bloc de la fitxa només pregunta si hi són', async () => {
    const client = new QueryClient()
    fetchMevesDades.mockClear()
    obre(client, A, <ViatgerBlock eventId={EVENT} />)
    await waitFor(() => {
      expect(screen.getByText('viatger.block.doneTitle')).toBeInTheDocument()
    })
    expect(fetchMevesDades).not.toHaveBeenCalled()
    expect(cauAmb(client, '12345678Z')).toBe(false)
  })
})

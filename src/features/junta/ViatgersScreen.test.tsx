import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type * as EventApi from '@/features/event/api'
import type * as ViatgerApi from '@/features/event/viatgerApi'

import { ViatgersScreen } from './ViatgersScreen'
import type * as ViatgersApi from './viatgersApi'

/**
 * Les dades que la junta mira no es queden a la memòria quan surt de la
 * pantalla.
 *
 * Es demanen amb una mutació perquè no vagin a la cau de consultes, però una
 * mutació acabada es queda cinc minuts al `MutationCache` amb el que va tornar.
 * Aquí això són els documents de tothom qui va a la casa.
 *
 * Persones i documents inventats.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', exists: () => false },
  }),
}))

const EVENT = '00000000-0000-4000-8000-0000000064e2'
const SOCI = '00000000-0000-4000-8000-0000000000cc'

vi.mock('@/features/event/viatgerApi', async (original) => ({
  ...(await original<typeof ViatgerApi>()),
  fetchDemanaViatger: () => Promise.resolve(true),
}))

vi.mock('@/features/event/api', async (original) => ({
  ...(await original<typeof EventApi>()),
  fetchEvent: () =>
    Promise.resolve({
      id: EVENT,
      titulo: 'Casa de prova',
      tipo: 'casa_rural',
      starts_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      ends_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    }),
}))

vi.mock('./viatgersApi', async (original) => ({
  ...(await original<typeof ViatgersApi>()),
  fetchApuntats: () =>
    Promise.resolve([
      { user_id: SOCI, nombre: 'Soci', estado: 'si', te_dades: true, actualitzat_at: null },
    ]),
  fetchDades: () =>
    Promise.resolve([
      {
        user_id: SOCI,
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
      },
    ]),
}))

describe('la junta mira les dades de viatger', () => {
  it('en sortir de la pantalla, el que va tornar la mutació no es queda enlloc', async () => {
    const client = new QueryClient()
    const pantalla = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/junta/esdeveniment/${EVENT}/viatgers`]}>
          <Routes>
            <Route path="/junta/esdeveniment/:id/viatgers" element={<ViatgersScreen />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'junta.viatgers.show' }))
    await screen.findByText('12345678Z')
    pantalla.unmount()

    await waitFor(() => {
      const guardat = client
        .getMutationCache()
        .getAll()
        .some((m) => JSON.stringify(m.state.data ?? null).includes('12345678Z'))
      expect(guardat).toBe(false)
    })
  })
})

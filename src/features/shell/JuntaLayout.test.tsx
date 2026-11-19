import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JuntaLayout } from './JuntaLayout'

/**
 * La porta de la junta sense perfil: tancada, excepte per a l'escàner.
 *
 * I dues coses més: que en entrar-hi la junta demani la porta per avançat, i
 * que una pantalla que no és al mòbil, sense xarxa, ho digui sense recarregar.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/features/junta/JuntaNav', () => ({ JuntaNav: () => null }))
const preloadDoor = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@/features/door/preload', () => ({ preloadDoor }))

const profile = vi.hoisted<{ current: unknown }>(() => ({ current: null }))
vi.mock('@/features/session/useMyProfile', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMyProfile: () => profile.current,
}))

const paused = {
  data: undefined,
  error: null,
  isError: false,
  status: 'pending',
  fetchStatus: 'paused',
  refetch: () => Promise.resolve(),
}

const admin = {
  ...paused,
  data: { role: 'admin' },
  status: 'success',
  fetchStatus: 'idle',
}

/** El que fa `lazy()` quan el tros no arriba. */
function Missing(): never {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/PaymentsScreen-x.js')
}

/** La xarxa de sota, per veure què hi arriba. */
class Below extends Component<{ readonly children: ReactNode }, { readonly up: boolean }> {
  override state = { up: false }
  static getDerivedStateFromError() {
    return { up: true }
  }
  override render() {
    return this.state.up ? <p>ha pujat</p> : this.props.children
  }
}

let client: QueryClient

function at(path: string) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Below>
          <Routes>
            <Route path="/junta" element={<JuntaLayout />}>
              <Route index element={<p>rebedor</p>} />
              <Route path="escaner/:eventId" element={<p>escàner</p>} />
              <Route path="pagaments/:eventId" element={<Missing />} />
            </Route>
            <Route path="/" element={<p>inici</p>} />
          </Routes>
        </Below>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  profile.current = paused
  client = new QueryClient()
  preloadDoor.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('JuntaLayout', () => {
  it('sense xarxa i sense perfil, el rebedor diu que no hi ha connexió', () => {
    at('/junta')
    expect(screen.getByRole('alert')).toHaveTextContent('errors.offline')
    expect(screen.queryByText('rebedor')).toBeNull()
  })

  it("sense xarxa i sense perfil, l'escàner s'obre igualment", () => {
    at('/junta/escaner/e1')
    expect(screen.getByText('escàner')).toBeInTheDocument()
  })

  it('amb el perfil que diu que no és de la junta, fora', () => {
    profile.current = {
      ...paused,
      data: { role: 'member' },
      status: 'success',
      fetchStatus: 'idle',
    }
    at('/junta/escaner/e1')
    expect(screen.getByText('inici')).toBeInTheDocument()
  })

  it('amb un perfil de la junta, demana la porta per avançat', () => {
    profile.current = admin
    at('/junta')
    expect(screen.getByText('rebedor')).toBeInTheDocument()
    expect(preloadDoor).toHaveBeenCalledTimes(1)
  })

  it('amb un perfil de soci, no demana res', () => {
    profile.current = { ...admin, data: { role: 'member' } }
    at('/junta')
    expect(preloadDoor).not.toHaveBeenCalled()
  })

  it('sense xarxa, una pantalla que no és al mòbil ho diu i dona el camí a la porta', () => {
    profile.current = admin
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    client.setQueryData(['junta', 'home'], { porta: { id: 'e7' } })
    at('/junta/pagaments/e7')

    expect(screen.getByRole('alert')).toHaveTextContent('junta.needsSignalTitle')
    expect(screen.queryByText('ha pujat')).toBeNull()
    expect(screen.getByRole('link', { name: 'junta.scan' })).toHaveAttribute(
      'href',
      '/junta/escaner/e7',
    )

    fireEvent.click(screen.getByRole('link', { name: 'junta.needsSignalBack' }))
    expect(screen.getByText('rebedor')).toBeInTheDocument()
  })

  it("sense saber la porta d'avui, només el camí de tornada", () => {
    profile.current = admin
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    at('/junta/pagaments/e7')
    expect(screen.queryByRole('link', { name: 'junta.scan' })).toBeNull()
    expect(screen.getByRole('link', { name: 'junta.needsSignalBack' })).toBeInTheDocument()
  })

  it('amb xarxa, el tros que falta és un desplegament: puja a la xarxa de sota', () => {
    profile.current = admin
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    at('/junta/pagaments/e7')
    expect(screen.getByText('ha pujat')).toBeInTheDocument()
  })
})

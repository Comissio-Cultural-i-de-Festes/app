import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { recordaPortes } from '@/features/junta/portesRecordades'
import { UserIdContext } from '@/features/session/context'

import { JuntaLayout } from './JuntaLayout'

/**
 * La porta de la junta sense perfil: tancada, excepte per a l'escàner i l'alta,
 * i amb l'escàner de les portes desades a la mateixa pantalla que la tanca.
 *
 * I dues coses més: que en entrar-hi la junta demani la porta per avançat, i
 * que una pantalla que no és al mòbil, sense xarxa, ho digui sense recarregar.
 */

const prefetchJunta = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('./startPrefetch', () => ({ prefetchJunta }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))
vi.mock('@/features/junta/JuntaNav', () => ({ JuntaNav: () => null }))
// Els textos de la junta, a la seva prova: aquí ja hi són.
vi.mock('./JuntaStrings', () => ({
  JuntaStrings: ({ children }: { readonly children: ReactNode }) => children,
}))
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

const USER = '00000000-0000-4000-8000-0000000000a1'
const CASA_ID = '00000000-0000-4000-8000-0000000089c1'

function desaLaCasaRural() {
  const ara = Date.now()
  recordaPortes(
    USER,
    [
      {
        id: CASA_ID,
        titulo: 'Casa rural inventada',
        starts_at: new Date(ara - 20 * 3_600_000).toISOString(),
        ends_at: new Date(ara + 30 * 3_600_000).toISOString(),
        ubicacion: null,
        plazas: null,
        diuen_si: 0,
        fitxats: 0,
        esperen: 0,
        no_pagats: 0,
        gimcana_cua: null,
      },
    ],
    ara - 3_600_000,
  )
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
    <UserIdContext value={USER}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Below>
            <Routes>
              <Route path="/junta" element={<JuntaLayout />}>
                <Route index element={<p>rebedor</p>} />
                <Route path="escaner/:eventId" element={<p>escàner</p>} />
                <Route path="alta/:eventId" element={<p>alta</p>} />
                <Route path="pagaments/:eventId" element={<Missing />} />
              </Route>
              <Route path="/" element={<p>inici</p>} />
            </Routes>
          </Below>
        </MemoryRouter>
      </QueryClientProvider>
    </UserIdContext>,
  )
}

beforeEach(() => {
  profile.current = paused
  localStorage.clear()
  client = new QueryClient()
  preloadDoor.mockClear()
  prefetchJunta.mockClear()
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

  it("sense xarxa i sense perfil, l'alta pel nom també", () => {
    at('/junta/alta/e1')
    expect(screen.getByText('alta')).toBeInTheDocument()
  })

  it('i la pantalla tancada ofereix l’escàner de les portes desades que encara són obertes', () => {
    const ara = Date.now()
    recordaPortes(
      USER,
      [
        {
          id: CASA_ID,
          titulo: 'Casa rural inventada',
          starts_at: new Date(ara - 20 * 3_600_000).toISOString(),
          ends_at: new Date(ara + 30 * 3_600_000).toISOString(),
          ubicacion: null,
          plazas: null,
          diuen_si: 0,
          fitxats: 0,
          esperen: 0,
          no_pagats: 0,
          gimcana_cua: null,
        },
      ],
      ara - 3_600_000,
    )
    at('/junta')

    expect(screen.getByRole('alert')).toHaveTextContent('errors.offline')
    expect(screen.getByText('Casa rural inventada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'junta.scan' })).toHaveAttribute(
      'href',
      `/junta/escaner/${CASA_ID}`,
    )
    expect(screen.getByText(/junta.home.recordades.title/)).toBeInTheDocument()
  })

  it('sense res desat —un soci que no ha vist mai la porta— no s’ofereix cap escàner', () => {
    at('/junta')
    expect(screen.getByRole('alert')).toHaveTextContent('errors.offline')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/junta.home.recordades.title/)).toBeNull()
  })

  it('a l’escàner i a l’alta sense perfil s’hi entra, i no s’hi afegeix res', () => {
    desaLaCasaRural()
    for (const [path, text] of [
      ['/junta/escaner/e1', 'escàner'],
      ['/junta/alta/e1', 'alta'],
    ] as const) {
      const { unmount } = at(path)
      expect(screen.getByText(text)).toBeInTheDocument()
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.queryByText(/junta.home.recordades.title/)).toBeNull()
      unmount()
    }
  })

  it('amb portes desades però un perfil que diu que no és de la junta, fora igualment', () => {
    // Les portes desades no són un permís: qui hereta el mòbil d'algú de la
    // junta i entra amb el seu compte va a l'inici, desades o no.
    desaLaCasaRural()
    profile.current = {
      ...paused,
      data: { role: 'member' },
      status: 'success',
      fetchStatus: 'idle',
    }
    for (const path of ['/junta', `/junta/escaner/${CASA_ID}`, `/junta/alta/${CASA_ID}`]) {
      const { unmount } = at(path)
      expect(screen.getByText('inici')).toBeInTheDocument()
      unmount()
    }
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

  describe("les dades de l'entrada", () => {
    const as = (role: string) => {
      profile.current = { ...paused, data: { role }, status: 'success', fetchStatus: 'idle' }
    }

    it('es demanen al rebedor quan qui hi entra és de la junta', () => {
      as('admin')
      at('/junta')
      expect(prefetchJunta).toHaveBeenCalledTimes(1)
    })

    it('no es demanen en una subruta, escàner inclòs: la cua SCANS ja competeix per la barra', () => {
      as('admin')
      at('/junta/escaner/e1')
      expect(prefetchJunta).not.toHaveBeenCalled()
    })

    it('no es demanen per a un soci', () => {
      as('member')
      at('/junta')
      expect(prefetchJunta).not.toHaveBeenCalled()
    })
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

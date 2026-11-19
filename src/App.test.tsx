import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { pendingInvite, rememberInvite } from './features/entry/pendingInvite'
import { rememberReturn, takeReturn } from './features/entry/returnTo'
import type * as Platform from './lib/platform'

/**
 * L'ordre dels porters a l'iPhone, muntat de debò.
 *
 * `installGate.test.ts` prova que la funció sap què fer amb una invitació;
 * això prova que `App` li diu que n'hi ha una. Sense aquesta peça, la funció
 * podia ser perfecta i la pantalla d'instal·lació seguir davant de la porta.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'ca', language: 'ca', exists: () => false },
  }),
}))

vi.mock('@/lib/platform', async (original) => ({
  ...(await original<typeof Platform>()),
  inAppBrowser: () => null,
  isIos: () => true,
  isStandalone: () => false,
}))

type AuthListener = (event: string, session: null) => void
let authListener: AuthListener = () => undefined

vi.mock('@/lib/supabase', () => ({
  // Una comprovació que no contesta: la cara de la porta no és el que es prova.
  rpc: () => new Promise(() => undefined),
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: (cb: AuthListener) => {
        authListener = cb
        return { data: { subscription: { unsubscribe: () => undefined } } }
      },
    },
  },
}))

function mount() {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={new QueryClient()}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('the gates in front of an iPhone with no session', () => {
  it('puts the door first when the link carries an invitation', async () => {
    window.history.replaceState({}, '', '/?codi=ABC-123')
    mount()

    expect(await screen.findByText('entry.invited.title')).toBeInTheDocument()
    expect(screen.queryByText('install.title')).not.toBeInTheDocument()
  })

  it('still puts the install screen first without one', async () => {
    mount()
    expect(await screen.findByText('install.title')).toBeInTheDocument()
  })
})

describe('signing out', () => {
  it('forgets a code still waiting to be redeemed', async () => {
    // Sigui quin sigui el camí —el botó del perfil, un token que ja no val,
    // una altra pestanya—: el codi que esperava era d'aquest compte, i el
    // següent que entri en aquesta pestanya no se l'ha de quedar.
    mount()
    await screen.findByText('install.title')
    rememberInvite('ABC-123')

    act(() => {
      authListener('SIGNED_OUT', null)
    })

    expect(pendingInvite()).toBeNull()
  })

  it('takes the code out of the address too', async () => {
    // El bescanvi el treu de la barra quan contesta. Si la sessió es tanca
    // abans, el `?codi=` es quedava, i el compte següent el bescanviava igual.
    window.history.replaceState({}, '', '/?codi=ABC-123')
    mount()
    await screen.findByText('entry.invited.title')
    rememberInvite('ABC-123')

    act(() => {
      authListener('SIGNED_OUT', null)
    })

    expect(window.location.search).toBe('')
  })

  it('leaves the code alone when nobody had used it yet', async () => {
    // Una sessió vella que ja no es pot refrescar també acaba en
    // `SIGNED_OUT`, en arrencar i abans de res. Qui arriba amb l'enllaç nou
    // en aquell Safari ha de seguir veient la invitació a la porta.
    window.history.replaceState({}, '', '/?codi=ABC-123')
    mount()
    await screen.findByText('entry.invited.title')

    act(() => {
      authListener('SIGNED_OUT', null)
    })

    expect(window.location.search).toBe('?codi=ABC-123')
  })

  it('forgets the saved route along with the code', async () => {
    mount()
    await screen.findByText('install.title')
    rememberInvite('ABC-123')
    rememberReturn('/esdeveniment/abc')

    act(() => {
      authListener('SIGNED_OUT', null)
    })

    expect(takeReturn()).toBeNull()
  })
})

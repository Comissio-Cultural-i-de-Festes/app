import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RequireOnboarding } from './RequireOnboarding'

/**
 * La porta del primer cop, amb el perfil que no arriba.
 *
 * Els dos casos que la deixaven a «Un segon…» per sempre: el perfil que falla
 * i es torna a demanar en muntar la pantalla de dins, i el que es queda en
 * pausa sense xarxa.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))

interface Fake {
  data: unknown
  error: unknown
  isError: boolean
  status: 'pending' | 'error' | 'success'
  fetchStatus: 'fetching' | 'paused' | 'idle'
  refetch: () => Promise<unknown>
}

const profile = vi.hoisted<{ current: unknown }>(() => ({ current: null }))

vi.mock('@/features/session/useMyProfile', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMyProfile: () => profile.current,
}))

const base: Fake = {
  data: undefined,
  error: null,
  isError: false,
  status: 'pending',
  fetchStatus: 'fetching',
  refetch: () => Promise.resolve(),
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RequireOnboarding />}>
          <Route path="/" element={<p>dins</p>} />
        </Route>
        <Route path="/primer-cop" element={<p>primer cop</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  profile.current = { ...base }
})

describe('RequireOnboarding', () => {
  it('espera mentre el perfil és a l’aire', () => {
    mount()
    expect(screen.getByText('state.loading')).toBeInTheDocument()
  })

  it('sense xarxa deixa passar, com ja feia amb un error', () => {
    profile.current = { ...base, fetchStatus: 'paused' }
    mount()
    expect(screen.getByText('dins')).toBeInTheDocument()
  })

  it('un cop oberta, un perfil que es torna a demanar no la torna a tancar', () => {
    profile.current = { ...base, status: 'error', isError: true, fetchStatus: 'idle' }
    const view = mount()
    expect(screen.getByText('dins')).toBeInTheDocument()

    profile.current = { ...base }
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireOnboarding />}>
            <Route path="/" element={<p>dins</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('dins')).toBeInTheDocument()
  })

  it('el perfil sense escola, quan arriba, porta al primer cop', () => {
    profile.current = { ...base, data: { escola: null }, status: 'success', fetchStatus: 'idle' }
    mount()
    expect(screen.getByText('primer cop')).toBeInTheDocument()
  })
})

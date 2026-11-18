import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JuntaLayout } from './JuntaLayout'

/**
 * La porta de la junta sense perfil: tancada, excepte per a l'escàner.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/features/junta/JuntaNav', () => ({ JuntaNav: () => null }))

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

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/junta" element={<JuntaLayout />}>
          <Route index element={<p>rebedor</p>} />
          <Route path="escaner/:eventId" element={<p>escàner</p>} />
        </Route>
        <Route path="/" element={<p>inici</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  profile.current = paused
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
})

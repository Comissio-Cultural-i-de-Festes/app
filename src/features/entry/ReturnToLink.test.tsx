import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { pendingInvite } from './pendingInvite'
import { ReturnToLink } from './ReturnToLink'
import { rememberReturn } from './returnTo'

const EVENT = '/esdeveniment/3f1c2a9e-0b7d-4c55-9a41-2d8e6f7a1b30'

function home(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <ReturnToLink />
              <p>inici</p>
            </>
          }
        />
        <Route path="/esdeveniment/:id" element={<p>fitxa</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe("tornar a l'enllaç", () => {
  it('porta a la fitxa desada', async () => {
    rememberReturn(EVENT)
    home()
    expect(await screen.findByText('fitxa')).toBeTruthy()
  })

  it("sense res desat es queda a l'Inici", () => {
    home()
    expect(screen.getByText('inici')).toBeTruthy()
  })

  it("no gasta la invitació: el codi de l'adreça queda desat abans de navegar", async () => {
    window.history.replaceState(null, '', '/?codi=ABC-123')
    rememberReturn(EVENT)
    home()
    expect(await screen.findByText('fitxa')).toBeTruthy()
    expect(pendingInvite()).toBe('ABC-123')
  })

  it("una ruta maliciosa a l'emmagatzematge s'ignora", () => {
    localStorage.setItem(
      'comi.return.to',
      JSON.stringify({ path: '//evil.example', at: Date.now() }),
    )
    home()
    expect(screen.getByText('inici')).toBeTruthy()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LegalShell } from './LegalShell'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Link to="/privacitat">privacitat</Link>
              <Where />
            </>
          }
        />
        <Route
          path="/privacitat"
          element={
            <LegalShell title="t" lead="l">
              <Where />
            </LegalShell>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => window.history.replaceState(null, '', '/'))

describe('LegalShell', () => {
  it('en entrada directa la fletxa va a l inici i no surt de l app', () => {
    window.history.replaceState(null, '', '/privacitat')
    render(<App />)
    fireEvent.click(screen.getByText(/legal.back/))
    expect(where()).toBe('/')
  })

  it('amb historial torna d on s ha vingut', async () => {
    render(<App />)
    fireEvent.click(screen.getByText('privacitat'))
    fireEvent.click(screen.getByText(/legal.back/))
    await waitFor(() => expect(where()).toBe('/'))
  })
})

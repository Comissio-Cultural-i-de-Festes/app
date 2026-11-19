import { fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { useBack } from './useBack'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function Event() {
  const { onClick } = useBack()
  return (
    <>
      <Link to="/" onClick={onClick}>
        enrere
      </Link>
      <Where />
    </>
  )
}

function Elsewhere({ name }: { readonly name: string }) {
  return (
    <>
      <Link to="/esdeveniment/1">{`obrir des de ${name}`}</Link>
      <Where />
    </>
  )
}

function App({ start }: { readonly start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path="/" element={<Elsewhere name="inici" />} />
        <Route path="/ranquing" element={<Elsewhere name="ranquing" />} />
        <Route path="/esdeveniment/1" element={<Event />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('useBack', () => {
  it('amb historial de l app, la fletxa torna d on s ha vingut', () => {
    render(<App start="/ranquing" />)
    fireEvent.click(screen.getByText('obrir des de ranquing'))
    expect(screen.getByTestId('where').textContent).toBe('/esdeveniment/1')
    fireEvent.click(screen.getByText('enrere'))
    expect(screen.getByTestId('where').textContent).toBe('/ranquing')
  })

  it('en un enllaç directe, primera pàgina de la sessió, va a l inici', () => {
    render(<App start="/esdeveniment/1" />)
    fireEvent.click(screen.getByText('enrere'))
    expect(screen.getByTestId('where').textContent).toBe('/')
  })

  it('un clic modificat no el captura (nova pestanya)', () => {
    render(<App start="/ranquing" />)
    fireEvent.click(screen.getByText('obrir des de ranquing'))
    fireEvent.click(screen.getByText('enrere'), { ctrlKey: true })
    expect(screen.getByTestId('where').textContent).toBe('/esdeveniment/1')
  })
})

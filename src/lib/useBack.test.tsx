import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { JuntaHeader } from '@/features/junta/JuntaHeader'

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
      <Link to="/esdeveniment/1/cotxes">cotxes</Link>
      <Where />
    </>
  )
}

function Rides() {
  return (
    <>
      <JuntaHeader viaHistory to="/esdeveniment/1" label="fitxa" />
      <Where />
    </>
  )
}

function Fixed() {
  return (
    <>
      <JuntaHeader to="/junta" label="junta" />
      <Where />
    </>
  )
}

function Elsewhere({ name }: { readonly name: string }) {
  return (
    <>
      <Link to="/esdeveniment/1">{`obrir des de ${name}`}</Link>
      <Link to="/formulari">formulari</Link>
      <Where />
    </>
  )
}

function App({ start }: { readonly start: string }) {
  window.history.replaceState(null, '', start)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Elsewhere name="inici" />} />
        <Route path="/ranquing" element={<Elsewhere name="ranquing" />} />
        <Route path="/retorn" element={<Navigate to="/esdeveniment/1" replace />} />
        <Route path="/esdeveniment/1" element={<Event />} />
        <Route path="/esdeveniment/1/cotxes" element={<Rides />} />
        <Route path="/junta" element={<Elsewhere name="junta" />} />
        <Route path="/formulari" element={<Fixed />} />
      </Routes>
    </BrowserRouter>
  )
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useBack', () => {
  it('amb historial de l app, la fletxa torna d on s ha vingut', async () => {
    render(<App start="/ranquing" />)
    fireEvent.click(screen.getByText('obrir des de ranquing'))
    expect(where()).toBe('/esdeveniment/1')
    fireEvent.click(screen.getByText('enrere'))
    await waitFor(() => expect(where()).toBe('/ranquing'))
  })

  it('en un enllaç directe, primera pàgina de la sessió, va a l inici', () => {
    render(<App start="/esdeveniment/1" />)
    fireEvent.click(screen.getByText('enrere'))
    expect(where()).toBe('/')
  })

  it('un replace a la primera entrada no compta com a historial', () => {
    render(<App start="/retorn" />)
    expect(where()).toBe('/esdeveniment/1')
    fireEvent.click(screen.getByText('enrere'))
    expect(where()).toBe('/')
  })

  it('un clic modificat no el captura (nova pestanya)', () => {
    render(<App start="/ranquing" />)
    fireEvent.click(screen.getByText('obrir des de ranquing'))
    fireEvent.click(screen.getByText('enrere'), { ctrlKey: true })
    expect(where()).toBe('/esdeveniment/1')
  })

  it('inici, fitxa, cotxes: dues fletxes tornen a l inici sense fer bucle', async () => {
    render(<App start="/" />)
    fireEvent.click(screen.getByText('obrir des de inici'))
    fireEvent.click(screen.getByText('cotxes'))
    expect(where()).toBe('/esdeveniment/1/cotxes')
    fireEvent.click(screen.getByText(/fitxa/))
    await waitFor(() => expect(where()).toBe('/esdeveniment/1'))
    fireEvent.click(screen.getByText('enrere'))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('una capçalera sense viaHistory porta sempre al destí fix', async () => {
    render(<App start="/ranquing" />)
    fireEvent.click(screen.getByText('formulari'))
    expect(where()).toBe('/formulari')
    fireEvent.click(screen.getByText(/junta/))
    await waitFor(() => expect(where()).toBe('/junta'))
  })
})

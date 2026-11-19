import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
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

function Offer() {
  const { back } = useBack('/esdeveniment/1/cotxes')
  return (
    <>
      <button onClick={back}>desa</button>
      <Where />
    </>
  )
}

const lateBack: { current: (() => void) | null } = { current: null }

function Slow() {
  const { back } = useBack('/esdeveniment/1/cotxes')
  useEffect(() => {
    lateBack.current = back
  })
  return (
    <>
      <Link to="/esdeveniment/1">fitxa</Link>
      <Where />
    </>
  )
}

function Scanner() {
  const { onClick } = useBack('/junta')
  return (
    <>
      <Link to="/junta" onClick={onClick}>
        tanca
      </Link>
      <Where />
    </>
  )
}

function Junta() {
  return (
    <>
      <JuntaHeader viaHistory to="/perfil" label="perfil" />
      <Where />
    </>
  )
}

function Rides() {
  return (
    <>
      <JuntaHeader viaHistory to="/esdeveniment/1" label="fitxa" />
      <Link to="/esdeveniment/1/cotxes/nou">nou</Link>
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
        <Route path="/junta" element={<Junta />} />
        <Route path="/junta/escaner" element={<Scanner />} />
        <Route path="/perfil" element={<Elsewhere name="perfil" />} />
        <Route path="/lent" element={<Slow />} />
        <Route path="/esdeveniment/1/cotxes/nou" element={<Offer />} />
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

  it('fitxa, cotxes, nou, desa: la fletxa torna a la fitxa sense duplicar cotxes', async () => {
    render(<App start="/" />)
    fireEvent.click(screen.getByText('obrir des de inici'))
    fireEvent.click(screen.getByText('cotxes'))
    fireEvent.click(screen.getByText('nou'))
    fireEvent.click(screen.getByText('desa'))
    await waitFor(() => expect(where()).toBe('/esdeveniment/1/cotxes'))
    fireEvent.click(screen.getByText(/fitxa/))
    await waitFor(() => expect(where()).toBe('/esdeveniment/1'))
  })

  it('desar en una entrada directa va al pare', () => {
    render(<App start="/esdeveniment/1/cotxes/nou" />)
    fireEvent.click(screen.getByText('desa'))
    expect(where()).toBe('/esdeveniment/1/cotxes')
  })

  it('en un enllaç directe a la filla, dues fletxes arriben a l inici sense bucle', async () => {
    render(<App start="/esdeveniment/1/cotxes" />)
    fireEvent.click(screen.getByText(/fitxa/))
    await waitFor(() => expect(where()).toBe('/esdeveniment/1'))
    fireEvent.click(screen.getByText('enrere'))
    await waitFor(() => expect(where()).toBe('/'))
  })

  it('a la junta, escàner, tancar i fletxa arriben al perfil', async () => {
    render(<App start="/junta/escaner" />)
    fireEvent.click(screen.getByText('tanca'))
    await waitFor(() => expect(where()).toBe('/junta'))
    fireEvent.click(screen.getByText(/perfil/))
    await waitFor(() => expect(where()).toBe('/perfil'))
  })

  it('un desar que acaba després d haver sortit no fa cap enrere de més', async () => {
    render(<App start="/ranquing" />)
    fireEvent.click(screen.getByText('obrir des de ranquing'))
    const state = { usr: null, key: 'l', idx: 2 }
    window.history.pushState(state, '', '/lent')
    window.dispatchEvent(new PopStateEvent('popstate', { state }))
    await waitFor(() => expect(where()).toBe('/lent'))
    const late = lateBack.current
    fireEvent.click(screen.getByText('fitxa'))
    await waitFor(() => expect(where()).toBe('/esdeveniment/1'))
    act(() => late?.())
    await new Promise((r) => setTimeout(r, 50))
    expect(where()).toBe('/esdeveniment/1')
  })
})

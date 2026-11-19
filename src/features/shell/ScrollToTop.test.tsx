import { act, fireEvent, render } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ScrollToTop } from './ScrollToTop'

let y = 0
const scrollTo = vi.fn((_x: number, top: number) => {
  y = top
})

function Go() {
  const navigate = useNavigate()
  return (
    <>
      <Link to="/b">a b</Link>
      <Link to="/a#ancora">ancora</Link>
      <button onClick={() => void navigate(-1)}>enrere</button>
    </>
  )
}

function App() {
  return (
    <MemoryRouter initialEntries={['/a']}>
      <ScrollToTop />
      <Routes>
        <Route path="/a" element={<Go />} />
        <Route path="/b" element={<Go />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  y = 0
  scrollTo.mockClear()
  sessionStorage.clear()
  vi.stubGlobal('scrollTo', scrollTo)
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const scrollTo_ = (top: number) => {
  y = top
  fireEvent.scroll(window)
}

describe('ScrollToTop', () => {
  it('una pantalla nova s obre a dalt', () => {
    const { getByText } = render(<App />)
    scrollTo_(500)
    fireEvent.click(getByText('a b'))
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
  })

  it('en tornar enrere restaura la posició en marxar', () => {
    const { getByText } = render(<App />)
    scrollTo_(500)
    fireEvent.click(getByText('a b'))
    act(() => {
      fireEvent.click(getByText('enrere'))
      vi.advanceTimersByTime(50)
    })
    expect(scrollTo).toHaveBeenLastCalledWith(0, 500)
  })

  it('un canvi només d àncora no mou res', () => {
    const { getByText } = render(<App />)
    scrollTo_(500)
    scrollTo.mockClear()
    fireEvent.click(getByText('ancora'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('deixa de reintentar quan la persona toca la pantalla', () => {
    const { getByText } = render(<App />)
    scrollTo_(500)
    fireEvent.click(getByText('a b'))
    y = 0
    act(() => {
      fireEvent.click(getByText('enrere'))
    })
    // La pàgina encara no és prou alta: el reintent no arriba.
    scrollTo.mockImplementation(() => undefined)
    act(() => {
      vi.advanceTimersByTime(50)
    })
    const calls = scrollTo.mock.calls.length
    act(() => {
      fireEvent.pointerDown(document.body)
      vi.advanceTimersByTime(500)
    })
    expect(scrollTo.mock.calls.length).toBe(calls)
  })
})

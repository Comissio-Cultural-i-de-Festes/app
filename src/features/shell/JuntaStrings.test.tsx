import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JuntaScreenBoundary } from './JuntaScreenBoundary'
import { JuntaStrings } from './JuntaStrings'

/**
 * Una pantalla d'escriptori no es pinta sense els seus textos, i la porta no
 * els espera.
 */

const strings = vi.hoisted(() => ({
  asked: [] as string[],
  promise: Promise.resolve(),
}))

vi.mock('@/i18n/junta', () => ({
  juntaStrings: (_i18n: unknown, language: string) => {
    strings.asked.push(language)
    return strings.promise
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'es', language: 'es-ES' },
  }),
}))

function at(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={<p>esperant</p>}>
          <JuntaScreenBoundary>
            <JuntaStrings>
              <p>pantalla</p>
            </JuntaStrings>
          </JuntaScreenBoundary>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * Pintat dins d'un `act` asíncron. Amb el síncron que fa `render`, una pantalla
 * que se suspèn a la primera no es torna a pintar quan la promesa es resol.
 */
async function suspended(path: string) {
  await act(async () => {
    at(path)
    await Promise.resolve()
  })
}

/** Una promesa que es resol quan ho diu la prova. */
function pending() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  strings.asked = []
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('JuntaStrings', () => {
  it.each([
    '/junta',
    '/junta/escaner/e1',
    '/junta/alta/e1',
    '/junta/punts/e1',
    '/junta/gimcana/e1',
  ])('la porta (%s) es pinta de seguida i no demana res', (path) => {
    strings.promise = new Promise(() => undefined)
    at(path)
    expect(screen.getByText('pantalla')).toBeInTheDocument()
    expect(strings.asked).toEqual([])
  })

  it("una d'escriptori espera els textos de l'idioma de la pantalla, i després es pinta", async () => {
    const arrival = pending()
    strings.promise = arrival.promise
    await suspended('/junta/socis')

    expect(screen.getByText('esperant')).toBeInTheDocument()
    expect(screen.queryByText('pantalla')).toBeNull()
    expect(strings.asked[0]).toBe('es')

    await act(async () => {
      arrival.resolve()
      await arrival.promise
    })
    expect(screen.getByText('pantalla')).toBeInTheDocument()
  })

  it('si no arriben sense xarxa, diu que cal xarxa com una pantalla que no hi és', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const arrival = pending()
    strings.promise = arrival.promise
    await suspended('/junta/registre')

    await act(async () => {
      arrival.reject(new TypeError('Failed to fetch dynamically imported module: /assets/es-x.js'))
      await arrival.promise.catch(() => undefined)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('junta.needsSignalTitle')
    expect(screen.queryByText('pantalla')).toBeNull()
  })
})

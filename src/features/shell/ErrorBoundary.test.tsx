import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

/**
 * La xarxa de sota, i sobretot que distingeixi els dos casos.
 *
 * El que importa no és que pinti un missatge: és que un tros que no ha arribat
 * —el cas del dia del desplegament— recarregui sol una vegada, i que un error
 * qualsevol NO ho faci. Recarregar en bucle davant d'un defecte de render seria
 * pitjor que la pantalla en blanc que això ve a evitar.
 */

function Peta({ amb }: { readonly amb: Error }): never {
  throw amb
}

const RELOADED = 'comi.chunk.reloaded'

let reload: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  reload = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload },
  })
  // React escriu l'error a la consola encara que el capturem.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('deixa passar el que funciona', () => {
    render(
      <ErrorBoundary>
        <p>tot bé</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('tot bé')).toBeInTheDocument()
  })

  it('un tros que no ha arribat recarrega sol', () => {
    render(
      <ErrorBoundary>
        <Peta amb={new Error('Failed to fetch dynamically imported module: /assets/x.js')} />
      </ErrorBoundary>,
    )
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(RELOADED)).toBe('1')
  })

  // Sense això, un tros que falla per falta de cobertura recarregaria en bucle.
  it('però només una vegada', () => {
    sessionStorage.setItem(RELOADED, '1')
    render(
      <ErrorBoundary>
        <Peta amb={new Error('error loading dynamically imported module')} />
      </ErrorBoundary>,
    )
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText(/versió nova|versión nueva|new version/i)).toBeInTheDocument()
  })

  // El control positiu del de dalt: un error corrent no ha de recarregar mai.
  it('i un error qualsevol no recarrega, només ho diu', () => {
    render(
      <ErrorBoundary>
        <Peta amb={new Error('cannot read properties of undefined')} />
      </ErrorBoundary>,
    )
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PocketQr } from './PocketQr'

/**
 * El QR de la butxaca: la porta de la sessió l'ensenya sense haver entrat.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/lib/supabase', () => ({ AUTH_STORAGE_KEY: 'sb-proves-auth-token', rpc: vi.fn() }))
// jsdom no dibuixa en un canvas; el que es prova és quin codi s'hi dibuixaria.
const toCanvas = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('qrcode', () => ({ default: { toCanvas } }))

const ID = '00000000-0000-4000-8000-000000000001'
const TOKEN = 'fd6b16d0-1030-4b84-a8d9-3db4b9fa6205'

beforeEach(() => {
  localStorage.clear()
  toCanvas.mockClear()
})

describe('PocketQr', () => {
  it('amb la sessió desada i el codi desat, dibuixa aquell codi', async () => {
    localStorage.setItem('sb-proves-auth-token', JSON.stringify({ user: { id: ID } }))
    localStorage.setItem(`comi.qr.${ID}`, TOKEN)
    render(<PocketQr />)

    expect(screen.getByRole('img', { name: 'qr.codeLabel' })).toBeInTheDocument()
    await waitFor(() => {
      expect(toCanvas).toHaveBeenCalledWith(expect.anything(), TOKEN, expect.anything())
    })
  })

  it('sense codi desat, ho diu', () => {
    localStorage.setItem('sb-proves-auth-token', JSON.stringify({ user: { id: ID } }))
    render(<PocketQr />)

    expect(screen.getByRole('status')).toHaveTextContent('qr.noneSaved')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it("el codi d'una altra persona no és el teu", () => {
    localStorage.setItem('sb-proves-auth-token', JSON.stringify({ user: { id: ID } }))
    localStorage.setItem('comi.qr.00000000-0000-4000-8000-000000000002', TOKEN)
    render(<PocketQr />)

    expect(screen.getByRole('status')).toHaveTextContent('qr.noneSaved')
  })
})

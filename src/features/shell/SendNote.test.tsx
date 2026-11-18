import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { STALL_MS } from '@/lib/useAvailability'

import { SendNote } from './SendNote'

/**
 * Què diu el botó quan el que s'ha enviat no arriba.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const idle = { isPending: false, isPaused: false, error: null }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SendNote', () => {
  it('en pausa diu que espera, sense alarma', () => {
    render(<SendNote send={{ ...idle, isPending: true, isPaused: true }} />)
    expect(screen.getByRole('status')).toHaveTextContent('errors.sendPaused')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a l’aire massa estona diu que la connexió va lenta', () => {
    vi.useFakeTimers()
    render(<SendNote send={{ ...idle, isPending: true }} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(STALL_MS)
    })
    expect(screen.getByRole('status')).toHaveTextContent('errors.sendSlow')
  })

  it('fallada sense xarxa diu que no ha sortit, no «per veure això»', () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    render(<SendNote send={{ ...idle, error: new Error('Failed to fetch') }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('errors.sendOffline')
  })

  it('les frases pròpies guanyen', () => {
    render(
      <SendNote
        send={{ ...idle, isPending: true, isPaused: true }}
        words={{ paused: 'a', slow: 'b', offline: 'c' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('a')
  })
})

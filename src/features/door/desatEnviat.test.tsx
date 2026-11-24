import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installFakeIndexedDb } from '../../../tests/fakeIndexedDb'

import type { RosterRow } from './api'

/**
 * Una alta feta sense xarxa i enviada després.
 *
 * Amb la cua de debò i el `flushQueue` de debò, perquè el que es prova és
 * justament el pas que cap pantalla esperava: el buidatge acaba, la cua queda
 * a zero i la fila i la tira de l'últim fitxat han de deixar de dir «desat».
 * Vist a Staging: es quedaven així fins que es recarregava la pàgina.
 */

installFakeIndexedDb()

const EVENT = '00000000-0000-4000-8000-0000000000e7'
const QUI = '00000000-0000-4000-8000-0000000000d7'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => {
      const answer = rpc(...args) as Promise<unknown>
      return {
        abortSignal: () => answer,
        select: () => answer,
        then: (ok: (value: unknown) => unknown, ko: (error: unknown) => unknown) =>
          answer.then(ok, ko),
      }
    },
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'ca' } }),
}))

vi.mock('react-router', () => ({
  useParams: () => ({ eventId: EVENT }),
  useNavigate: () => () => undefined,
  Link: ({ children }: { readonly children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('@/features/event/api', () => ({
  eventKeys: { one: (id: string) => ['event', id] as const },
  fetchEvent: () => Promise.resolve({ id: EVENT, titulo: 'Quiz inventat', precio_cents: 500 }),
}))

const LLISTA: RosterRow[] = [
  {
    user_id: QUI,
    nombre: 'November',
    escola: 'salut',
    curs: null,
    estado: 'si',
    pagado: true,
    checked_in: false,
  },
]

const xarxa = { data: null, error: { message: 'network', code: '' } }
const { clearAllQueues } = await import('@/lib/queue')
const { flushQueue } = await import('./api')
const { ManualScreen } = await import('./ManualScreen')

function munta(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ManualScreen />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await clearAllQueues()
  rpc.mockReset()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
})

describe('l’alta pel nom quan el buidatge de la cua arriba', () => {
  async function fitxaSenseXarxa(): Promise<HTMLElement> {
    rpc.mockImplementation((name: string) =>
      name === 'checkin_roster'
        ? Promise.resolve({ data: LLISTA, error: null })
        : Promise.resolve(xarxa),
    )
    munta()
    const boto = await screen.findByRole('button', { name: /November/ })
    fireEvent.click(boto)
    await waitFor(() => {
      expect(boto.textContent).toContain('scanner.queued')
    })
    return boto
  }

  it('la fila deixa de dir desat quan el servidor contesta', async () => {
    const boto = await fitxaSenseXarxa()

    rpc.mockImplementation((name: string) =>
      name === 'checkin_roster'
        ? Promise.resolve({ data: LLISTA, error: null })
        : Promise.resolve({
            data: { status: 'ok', user_id: QUI, nombre: 'November', points_awarded: 10 },
            error: null,
          }),
    )
    await act(async () => {
      await flushQueue()
    })

    await waitFor(() => {
      expect(boto.textContent).not.toContain('scanner.queued')
    })
    const tira = document.querySelector('[role="status"]')
    expect(tira?.textContent).not.toContain('scanner.queued')
    expect(tira?.textContent).toContain('scanner.ok')
  })

  it('si el servidor diu que ja era dins, ho diu', async () => {
    const boto = await fitxaSenseXarxa()

    rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data: name === 'checkin_roster' ? LLISTA : { status: 'already_checked_in', user_id: QUI },
        error: null,
      }),
    )
    await act(async () => {
      await flushQueue()
    })

    await waitFor(() => {
      expect(boto.textContent).toContain('scanner.alreadyCheckedIn')
    })
  })
})

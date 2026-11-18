import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { QueryProvider } from './QueryProvider'
import { APP_REVALIDATE, appRevalidate } from './pwa'
import { signedKey } from './signedQuery'

/**
 * Tornar a l'app refresca les dades i no torna a signar cap imatge.
 *
 * És el camí real del defecte: `pwa.ts` emet en tornar al primer pla i en
 * recuperar la xarxa, i aquí es reacciona. Abans s'hi invalidava tot, URL
 * signades incloses, i cada portada i cada cara es tornava a baixar sencera.
 */

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }))

function mount(): QueryClient {
  let client: QueryClient | null = null
  function Grab() {
    client = useQueryClient()
    return null
  }
  render(
    <QueryProvider>
      <Grab />
    </QueryProvider>,
  )
  return client!
}

describe('QueryProvider en tornar a l’app', () => {
  it('invalida les dades i deixa en pau les URL signades', async () => {
    const client = mount()
    client.setQueryData(['events', 'home'], { reveal: false })
    client.setQueryData(signedKey('event-covers', 'a/1.jpg'), new Map([['a/1.jpg', 'u']]))
    client.setQueryData(signedKey('avatars', 'b/2.jpg'), 'u')

    appRevalidate.dispatchEvent(new Event(APP_REVALIDATE))

    const cache = client.getQueryCache()
    await waitFor(() => {
      expect(cache.find({ queryKey: ['events', 'home'] })?.state.isInvalidated).toBe(true)
    })
    expect(
      cache.find({ queryKey: signedKey('event-covers', 'a/1.jpg') })?.state.isInvalidated,
    ).toBe(false)
    expect(cache.find({ queryKey: signedKey('avatars', 'b/2.jpg') })?.state.isInvalidated).toBe(
      false,
    )
  })
})

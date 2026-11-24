import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { QueryProvider } from './QueryProvider'
import { APP_REVALIDATE, appRevalidate } from './pwa'
import { signedKey } from './signedQuery'
import { STORAGE_REMOVED, storageRemovals } from './storage'

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
    client.setQueryData(signedKey('event-covers', 'a/1.jpg'), 'https://cdn.test/a')
    client.setQueryData(signedKey('avatars', 'b/2.jpg'), 'https://cdn.test/b')

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

describe('QueryProvider quan s’esborra una foto', () => {
  it('treu la URL signada d’aquell camí i de cap altre', async () => {
    const client = mount()
    client.setQueryData(signedKey('avatars', 'u/1.jpg'), 'https://cdn.test/vella')
    client.setQueryData(signedKey('avatars', 'u/2.jpg'), 'https://cdn.test/nova')
    client.setQueryData(signedKey('event-covers', 'u/1.jpg'), 'https://cdn.test/portada')

    storageRemovals.dispatchEvent(
      new CustomEvent(STORAGE_REMOVED, { detail: { bucket: 'avatars', paths: ['u/1.jpg'] } }),
    )

    const cache = client.getQueryCache()
    await waitFor(() => {
      expect(cache.find({ queryKey: signedKey('avatars', 'u/1.jpg') })).toBeUndefined()
    })
    expect(client.getQueryData(signedKey('avatars', 'u/2.jpg'))).toBe('https://cdn.test/nova')
    expect(client.getQueryData(signedKey('event-covers', 'u/1.jpg'))).toBe(
      'https://cdn.test/portada',
    )
  })
})

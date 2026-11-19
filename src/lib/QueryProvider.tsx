import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'

import { APP_REVALIDATE, appRevalidate } from './pwa'
import { createQueryClient } from './queryClient'
import { forgetSigned, invalidateData } from './signedQuery'
import { type Removed, STORAGE_REMOVED, storageRemovals } from './storage'

/**
 * The client lives in state, not in a module constant, so that a test can
 * mount a fresh one and two tests cannot see each other's cache.
 *
 * The subscription is the hourly half of staleness. React Query already
 * refetches on focus and on reconnect; what it has no way to know about is the
 * app that has been open on a table all evening while a reveal time passed.
 *
 * Everything except signed image URLs. Invalidating those too re-signed every
 * cover and every face each time the phone came out of a pocket, and a new
 * signature is a new URL the browser downloads in full — see `signedQuery.ts`.
 *
 * And when an object is removed, its signed URL goes with it: `storage.ts`
 * cannot reach this client, so it announces the removal and this listens.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient)

  useEffect(() => {
    const refresh = (): void => {
      void invalidateData(client)
    }
    const forget = (event: Event): void => {
      const { bucket, paths } = (event as CustomEvent<Removed>).detail
      forgetSigned(client, bucket, paths)
    }
    appRevalidate.addEventListener(APP_REVALIDATE, refresh)
    storageRemovals.addEventListener(STORAGE_REMOVED, forget)
    return () => {
      appRevalidate.removeEventListener(APP_REVALIDATE, refresh)
      storageRemovals.removeEventListener(STORAGE_REMOVED, forget)
    }
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

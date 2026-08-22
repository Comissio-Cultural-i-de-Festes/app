import { QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'

import { APP_REVALIDATE, appRevalidate } from './pwa'
import { createQueryClient } from './queryClient'

/**
 * The client lives in state, not in a module constant, so that a test can
 * mount a fresh one and two tests cannot see each other's cache.
 *
 * The subscription is the hourly half of staleness. React Query already
 * refetches on focus and on reconnect; what it has no way to know about is the
 * app that has been open on a table all evening while a reveal time passed.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient)

  useEffect(() => {
    const refresh = (): void => {
      void client.invalidateQueries()
    }
    appRevalidate.addEventListener(APP_REVALIDATE, refresh)
    return () => {
      appRevalidate.removeEventListener(APP_REVALIDATE, refresh)
    }
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

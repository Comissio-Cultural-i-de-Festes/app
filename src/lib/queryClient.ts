import { QueryClient } from '@tanstack/react-query'

import { isPermanent } from './db'
import { withSignedDefaults } from './signedQuery'

const MINUTE = 60_000

/** Exported for the screens that have to say how old what they show is. */
export const STALE_TIME_MS = MINUTE

/**
 * Defaults for every query in the app.
 *
 * The shape of the problem: a phone that has been in a pocket since yesterday,
 * opened at the door of an event, on a network that is one bar of 4G shared
 * with two hundred people. Cached data shown immediately and refreshed behind
 * it beats a spinner every time — but the data on a reveal countdown or a
 * places-left number goes stale in minutes, not hours.
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that moving between the two tabs does not refetch, short
        // enough that "queden 3 places" is not something you can act on after
        // it stopped being true.
        staleTime: STALE_TIME_MS,
        gcTime: 30 * MINUTE,
        retry: (failureCount, error) => !isPermanent(error) && failureCount < 2,
        // Both of these matter more here than on a desktop app: the tab is
        // never closed, it is backgrounded, and the network comes and goes.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  })
  // Les URL signades tenen els seus propis temps, lligats a la vida de la firma
  // i no a la de les dades: vegeu `signedQuery.ts`.
  return withSignedDefaults(client)
}

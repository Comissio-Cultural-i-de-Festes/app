import { QueryClient } from '@tanstack/react-query'

import { isPermanent } from './db'

const MINUTE = 60_000

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
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that moving between the two tabs does not refetch, short
        // enough that "queden 3 places" is not something you can act on after
        // it stopped being true.
        staleTime: MINUTE,
        gcTime: 30 * MINUTE,
        retry: (failureCount, error) => !isPermanent(error) && failureCount < 2,
        // Both of these matter more here than on a desktop app: the tab is
        // never closed, it is backgrounded, and the network comes and goes.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  })
}

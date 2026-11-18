import { useQuery } from '@tanstack/react-query'

import { COVERS, signedUrlsQuery } from '@/lib/storage'

/**
 * Signed URLs for a set of cover paths, in one round trip.
 *
 * Keyed on the sorted paths so two screens showing the same events share one
 * result. How long a signature is kept, and why returning to the app does not
 * replace it, is `lib/signedQuery.ts`. Returns a lookup rather than an array:
 * callers hold the event, not an index.
 */
export function useCovers(paths: readonly (string | null)[]) {
  const wanted = [...new Set(paths.filter((p): p is string => p !== null && p !== ''))].sort()

  return useQuery({
    ...signedUrlsQuery(COVERS, wanted),
    enabled: wanted.length > 0,
  })
}

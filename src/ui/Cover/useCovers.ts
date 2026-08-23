import { useQuery } from '@tanstack/react-query'

import { COVERS, signedUrls } from '@/lib/storage'

/**
 * Signed URLs for a set of cover paths, in one round trip.
 *
 * Keyed on the sorted paths so two screens showing the same events share one
 * result, and re-signed every fifty minutes because the links last an hour.
 * Returns a lookup rather than an array: callers hold the event, not an index.
 */
export function useCovers(paths: readonly (string | null)[]) {
  const wanted = [...new Set(paths.filter((p): p is string => p !== null && p !== ''))].sort()

  return useQuery({
    queryKey: ['covers', ...wanted],
    queryFn: () => signedUrls(COVERS, wanted),
    enabled: wanted.length > 0,
    staleTime: 50 * 60 * 1000,
  })
}

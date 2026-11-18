import { COVERS } from '@/lib/storage'
import { useSignedUrls } from '@/lib/useSignedUrls'

/**
 * Signed URLs for a set of cover paths, as a lookup from path to URL.
 *
 * One cache entry per cover rather than per set: a new event on the home
 * screen signs that event's cover and leaves the others' URLs — and the
 * browser's copy of the pictures behind them — alone. How long a signature is
 * kept, and why returning to the app does not replace it, is
 * `lib/signedQuery.ts`. A lookup rather than an array: callers hold the event,
 * not an index.
 */
export function useCovers(paths: readonly (string | null)[]) {
  return useSignedUrls(COVERS, paths)
}

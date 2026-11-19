import type { BackendModule, ResourceKey } from 'i18next'

import { isMissingChunk } from '@/features/shell/missingChunk'

/**
 * How a language that is not in the bundle gets here, and what happens when it
 * does not.
 *
 * Until the language arrives the app draws nothing but its background, so
 * every way of not arriving has to end somewhere:
 *
 * - IT HANGS. A saturated wifi does not fail a request, it just never answers
 *   it, and the first visit of somebody whose phone is in Spanish would stay a
 *   blank screen for as long as the browser cares to wait. After `timeoutMs`
 *   i18next is told it failed and the fallback language shows. If the file
 *   turns up later after all, `onLate` hands it over and the screen switches:
 *   a few seconds in Catalan are better than none in anything.
 * - THE CHUNK IS GONE. A tab that was open across a deploy asks for the old
 *   file name, which no longer exists anywhere. With a connection, reloading
 *   is the fix — the new page asks for the new name — so it reloads, once per
 *   session, as the `ErrorBoundary` does for screens. Without a connection the
 *   reload would bring nothing, and the fallback language shows.
 * - ANYTHING ELSE fails over to the fallback language straight away.
 *
 * Its own file rather than inline in `index.ts` so that the timings can be
 * tested without a real network or a real build.
 */

const RELOADED = 'comi.locale.reloaded'

export interface LazyLocaleOptions {
  /** One loader per language that does not travel in the bundle. */
  readonly loaders: Readonly<Record<string, (() => Promise<ResourceKey>) | undefined>>
  readonly timeoutMs: number
  readonly onLate: (language: string, resources: ResourceKey) => void
  readonly reload: () => void
}

function reloadOnce(reload: () => void): boolean {
  try {
    if (sessionStorage.getItem(RELOADED) !== null) return false
    sessionStorage.setItem(RELOADED, '1')
  } catch {
    // Without storage there is no way to know it already happened once, and
    // a reload that may loop is worse than the fallback language.
    return false
  }
  reload()
  return true
}

export function lazyLocales({
  loaders,
  timeoutMs,
  onLate,
  reload,
}: LazyLocaleOptions): BackendModule {
  return {
    type: 'backend',
    init: () => undefined,
    read(language, _namespace, callback) {
      const load = loaders[language]
      if (load === undefined) {
        callback(new Error(`no locale ${language}`), false)
        return
      }

      let settled = false
      const timer = setTimeout(() => {
        settled = true
        callback(new Error(`locale ${language} timed out`), false)
      }, timeoutMs)

      load().then(
        (resources) => {
          clearTimeout(timer)
          if (settled) {
            onLate(language, resources)
            return
          }
          settled = true
          callback(null, resources)
        },
        (error: unknown) => {
          clearTimeout(timer)
          if (settled) return
          settled = true
          if (isMissingChunk(error) && navigator.onLine && reloadOnce(reload)) return
          callback(error instanceof Error ? error : new Error(String(error)), false)
        },
      )
    },
  }
}

import i18next, { type i18n as I18n, type ResourceKey } from 'i18next'

import { SUPPORTED_LOCALES } from './locales'

/**
 * The strings of the junta's desk screens, fetched when somebody opens one.
 *
 * They are not in the bundle with the rest of Catalan, nor in the Spanish and
 * English chunks: every member downloaded them and none of them reads them.
 * What stays behind and what comes from here is decided at build time, in
 * `build/localeSplit.ts`; the strings the door uses are not here, because the
 * door has to open with no signal after any deploy.
 *
 * One promise per language, kept, so that `use()` sees the same one on every
 * render and a second screen does not fetch again.
 *
 * ONE THAT FAILED IS KEPT TOO, until the connection comes back. It used to be
 * forgotten straight away so that the next screen would try again, and with no
 * signal that never ended: React renders a suspended screen again when its
 * promise settles, the render asked for a fresh promise, that one failed as
 * well, and so on. The screen never got to say it needs a connection, and the
 * one before it stayed on screen. Kept, the failure reaches
 * `JuntaScreenBoundary` like a screen chunk that is not on the phone. What
 * forgets it is the browser saying it is online again; with a connection that
 * does not answer, the boundary reloads once, as it does for a screen.
 */

export type JuntaLoaders = Readonly<Record<string, (() => Promise<ResourceKey>) | undefined>>

export interface JuntaStrings {
  (i18n: Pick<I18n, 'addResourceBundle'>, language: string): Promise<void>
  /** Lets the languages that failed be asked for again. */
  readonly forgetFailures: () => void
}

export function juntaStringsFrom(loaders: JuntaLoaders): JuntaStrings {
  const loading = new Map<string, Promise<void>>()
  const failed = new Set<string>()
  const strings = (i18n: Pick<I18n, 'addResourceBundle'>, language: string) => {
    const known = loading.get(language)
    if (known !== undefined) return known

    const load = loaders[language]
    const promise =
      load === undefined
        ? Promise.resolve()
        : load().then(
            (strings) => {
              // Deep, so that it lands beside the `junta.` keys the bundle
              // already brought instead of replacing them.
              i18n.addResourceBundle(language, 'translation', strings, true, true)
            },
            (error: unknown) => {
              failed.add(language)
              throw error
            },
          )
    loading.set(language, promise)
    return promise
  }
  const forgetFailures = () => {
    for (const language of failed) loading.delete(language)
    failed.clear()
  }
  return Object.assign(strings, { forgetFailures })
}

const pieces = import.meta.glob<ResourceKey>('./locales/*.json', {
  query: '?junta',
  import: 'default',
})

export const juntaStrings = juntaStringsFrom(
  Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, pieces[`./locales/${locale}.json`]]),
  ),
)

if (typeof window !== 'undefined') {
  window.addEventListener('online', juntaStrings.forgetFailures)
}

/**
 * Ahead of time, for the language on screen. For the service worker to keep a
 * copy as much as for speed: the desk screens the door preloads would open
 * offline and then wait for strings that never come (`door/preload.ts`).
 */
export function preloadJuntaStrings(): Promise<void> {
  if (!i18next.isInitialized) return Promise.resolve()
  return juntaStrings(i18next, i18next.resolvedLanguage ?? i18next.language)
}

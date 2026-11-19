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
 * render and a second screen does not fetch again. One that failed is
 * forgotten, so the next screen tries again rather than inheriting the error.
 */

export type JuntaLoaders = Readonly<Record<string, (() => Promise<ResourceKey>) | undefined>>

export type JuntaStrings = (
  i18n: Pick<I18n, 'addResourceBundle'>,
  language: string,
) => Promise<void>

export function juntaStringsFrom(loaders: JuntaLoaders): JuntaStrings {
  const loading = new Map<string, Promise<void>>()
  return (i18n, language) => {
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
              loading.delete(language)
              throw error
            },
          )
    loading.set(language, promise)
    return promise
  }
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

/**
 * Ahead of time, for the language on screen. For the service worker to keep a
 * copy as much as for speed: the desk screens the door preloads would open
 * offline and then wait for strings that never come (`door/preload.ts`).
 */
export function preloadJuntaStrings(): Promise<void> {
  if (!i18next.isInitialized) return Promise.resolve()
  return juntaStrings(i18next, i18next.resolvedLanguage ?? i18next.language)
}

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
 * HOW IT FAILS. Every way of not arriving ends as a `JuntaStringsUnavailable`,
 * which `JuntaScreenBoundary` turns into "this screen needs a connection":
 *
 * - NO SIGNAL. The chunk is not in the service worker's cache and the fetch
 *   fails.
 * - A WIFI WITH NO INTERNET. The phone is connected, so `navigator.onLine` says
 *   yes, and the fetch fails or never answers. A failure here used to be
 *   treated like a chunk a deploy had removed: the app-wide boundary reloaded
 *   the page and then announced a new version that did not exist.
 * - IT HANGS. After `JUNTA_TIMEOUT_MS` it is given up. If it turns up later,
 *   it is stored anyway, and the next screen has it straight away.
 *
 * A failure is kept until the boundary has shown it, and forgotten there, so
 * that the next screen somebody opens tries again. Forgetting it earlier, here,
 * never ended with no signal: React renders a suspended screen again when its
 * promise settles, the render asked for a fresh promise, that one failed too,
 * and the screen never got as far as saying it needed a connection.
 */

/**
 * Eight seconds, twice what a language gets (`i18n/index.ts`). That one holds
 * a blank screen for everybody; this one holds the wait of a screen somebody
 * chose to open, and what comes after it is a message, not the screen. About
 * ten KiB, so on a connection that works at all it is long enough.
 */
export const JUNTA_TIMEOUT_MS = 8000

export class JuntaStringsUnavailable extends Error {
  constructor(language: string, cause: unknown) {
    super(`junta strings for ${language} did not arrive`, { cause })
    this.name = 'JuntaStringsUnavailable'
  }
}

export type JuntaLoaders = Readonly<Record<string, (() => Promise<ResourceKey>) | undefined>>

export interface JuntaStrings {
  (i18n: Pick<I18n, 'addResourceBundle'>, language: string): Promise<void>
  /** Lets the languages that failed be asked for again. */
  readonly forgetFailures: () => void
}

export function juntaStringsFrom(
  loaders: JuntaLoaders,
  timeoutMs: number = JUNTA_TIMEOUT_MS,
): JuntaStrings {
  const loading = new Map<string, Promise<void>>()
  const failed = new Set<string>()

  const fetchFor = (
    i18n: Pick<I18n, 'addResourceBundle'>,
    language: string,
    load: () => Promise<ResourceKey>,
  ) => {
    // Deep, so that it lands beside the `junta.` keys the bundle already
    // brought instead of replacing them. Also when it arrives after the
    // timeout: the next screen finds it there.
    const arrival = load().then((strings) => {
      i18n.addResourceBundle(language, 'translation', strings, true, true)
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`timed out after ${String(timeoutMs)} ms`))
      }, timeoutMs)
    })
    return Promise.race([arrival, timeout]).then(
      () => {
        clearTimeout(timer)
      },
      (error: unknown) => {
        clearTimeout(timer)
        failed.add(language)
        throw new JuntaStringsUnavailable(language, error)
      },
    )
  }

  const strings = (i18n: Pick<I18n, 'addResourceBundle'>, language: string) => {
    const known = loading.get(language)
    if (known !== undefined) return known
    const load = loaders[language]
    const promise = load === undefined ? Promise.resolve() : fetchFor(i18n, language, load)
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

/**
 * Ahead of time, for the language on screen. For the service worker to keep a
 * copy as much as for speed: the desk screens the door preloads would open
 * offline and then wait for strings that never come (`door/preload.ts`).
 *
 * A failure here is forgotten at once: nothing is on screen to show it, and
 * kept, the first desk screen opened later with a good connection would say
 * it needs one.
 */
export function preloadJuntaStrings(): Promise<void> {
  if (!i18next.isInitialized) return Promise.resolve()
  return juntaStrings(i18next, i18next.resolvedLanguage ?? i18next.language).catch(
    (error: unknown) => {
      juntaStrings.forgetFailures()
      throw error
    },
  )
}

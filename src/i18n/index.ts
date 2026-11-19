import i18n, { type ResourceKey } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { lazyLocales } from './backend'
import { adoptLateLocale } from './late'
import ca from './locales/ca.json'
import {
  BUNDLED_LOCALE,
  DEFAULT_LOCALE,
  DETECTION,
  SUPPORTED_LOCALES,
  fallbackLocales,
} from './locales'

/**
 * One language travels with the app; the other two are fetched when somebody
 * actually reads in them.
 *
 * The three files were about a third of the JavaScript a phone downloaded
 * before it could draw anything, and any one person reads exactly one of them.
 * Most people read Catalan, so Catalan is the one in the bundle. Spanish and
 * English become chunks of their own, and they stay out of the precache too:
 * a phone downloads the one it reads, the first time it reads it, and the
 * service worker keeps it from then on, so a choice made once still works with
 * no signal. Why, and what that costs, is in `build/precache.ts`.
 *
 * Catalan and not "whatever VITE_DEFAULT_LOCALE says". A static import cannot
 * be chosen by an env var without a resolve alias in the Vite config, and a
 * dynamic import of the default would put one more round trip in front of
 * every first paint. A fork that defaults to another language still works —
 * its default arrives as a chunk, like a member's own choice does here.
 *
 * Whoever has chosen another language waits for it rather than seeing Catalan
 * for a moment: until it arrives `useTranslation` suspends, and `App` draws the
 * app's background and a pulsing mark, no text. If it cannot arrive, the
 * fallback language shows instead; how long that wait can last, and what
 * happens to a chunk that a deploy removed, is in `backend.ts`.
 */
const chunks = import.meta.glob<ResourceKey>('./locales/*.json', { import: 'default' })

/**
 * Four seconds: long enough for a 30 KiB file over a bad 4G, short enough that
 * somebody staring at an empty screen has not given up on the app yet.
 */
const LOCALE_TIMEOUT_MS = 4000

const backend = lazyLocales({
  loaders: Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, chunks[`./locales/${locale}.json`]]),
  ),
  timeoutMs: LOCALE_TIMEOUT_MS,
  onLate: (language, resources) => {
    adoptLateLocale(i18n, language, resources)
  },
  reload: () => {
    window.location.reload()
  },
})

void i18n
  .use(backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { [BUNDLED_LOCALE]: { translation: ca } },
    // Without it, handing i18next any resources at all means "these are all
    // of them", and the backend is never asked for Spanish or English.
    partialBundledLanguages: true,
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: fallbackLocales(DEFAULT_LOCALE),
    load: 'languageOnly', // ca-ES resolves to ca
    nonExplicitSupportedLngs: true,
    detection: DETECTION,
    interpolation: { escapeValue: false }, // React escapes already
    returnNull: false,
    returnEmptyString: false,
  })

/**
 * Keep `<html lang>` in sync. It drives hyphenation (which the CTA buttons
 * rely on to wrap long Catalan labels), screen-reader pronunciation, and the
 * browser's own offer to translate the page.
 */
function syncHtmlLang(lng: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}

// The language on screen, not the one asked for: when a chosen language could
// not be fetched the page is in the fallback, and `lang` has to say so.
const syncResolved = (): void => {
  syncHtmlLang(i18n.resolvedLanguage ?? DEFAULT_LOCALE)
}
syncResolved()
i18n.on('languageChanged', syncResolved)

export default i18n

import i18n, { type ResourceKey } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { lazyLocales } from './backend'
import ca from './locales/ca.json'
import {
  BUNDLED_LOCALE,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
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
 * English become chunks of their own: the service worker precaches them like
 * any other chunk, so a choice made once still works with no signal.
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
    i18n.addResourceBundle(language, 'translation', resources, true, true)
    // Same language again: nothing is fetched, but `languageChanged` fires and
    // every `useTranslation` redraws with the strings that just arrived.
    if (i18n.language === language) void i18n.changeLanguage(language)
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
    detection: {
      // localStorage FIRST, then the browser.
      //
      // The brief says "detect the browser language, store the choice", but
      // those two cannot both hold in this order: the detector returns the
      // first source that yields a supported language, and `navigator` always
      // yields one. With navigator first, the stored value gets written on
      // every change and then never read, so the language picker appears to do
      // nothing after a reload.
      //
      // This order is what the requirement actually describes: fall back to
      // the phone's language on a first visit, and remember an explicit choice
      // afterwards.
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
    },
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

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import ca from './locales/ca.json'
import en from './locales/en.json'
import es from './locales/es.json'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from './locales'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ca: { translation: ca },
      es: { translation: es },
      en: { translation: en },
    },
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
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

syncHtmlLang(i18n.resolvedLanguage ?? DEFAULT_LOCALE)
i18n.on('languageChanged', syncHtmlLang)

export default i18n

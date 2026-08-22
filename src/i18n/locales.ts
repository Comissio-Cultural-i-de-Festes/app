export const SUPPORTED_LOCALES = ['ca', 'es', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ca'
export const LOCALE_STORAGE_KEY = 'comi.locale'

/**
 * BCP-47 tags for Intl. `en-GB` rather than `en-US`: 24-hour clock and
 * day-first dates, which is what someone in Mataró expects to read even when
 * they have the app in English.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  ca: 'ca-ES',
  es: 'es-ES',
  en: 'en-GB',
}

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

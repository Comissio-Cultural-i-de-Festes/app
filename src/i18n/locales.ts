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

/**
 * i18next reports the resolved language as a plain string, and it can be
 * undefined before init settles. Everything that formats a date needs a Locale,
 * so the narrowing happens once here rather than at each call site.
 */
export function toLocale(value: string | undefined): Locale {
  return value !== undefined && isLocale(value) ? value : DEFAULT_LOCALE
}

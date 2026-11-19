import type { DetectorOptions } from 'i18next-browser-languagedetector'

import { env } from '@/config/env'

export const SUPPORTED_LOCALES = ['ca', 'es', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/**
 * What a first visit falls back to when the phone's language is none of the
 * three, and what any missing string falls back to. It was a literal `'ca'`
 * while `.env.example` and the README already offered the variable, so a fork
 * that set it changed the manifest and nothing on screen. A value that is not
 * one of the three is ignored rather than trusted.
 */
export const DEFAULT_LOCALE: Locale = isLocale(env.defaultLocale) ? env.defaultLocale : 'ca'

/** The one language that travels inside the bundle; see `i18n/index.ts`. */
export const BUNDLED_LOCALE: Locale = 'ca'

/**
 * What i18next falls back to, in order: the configured default, and the
 * bundled language last. With a default other than Catalan that cannot be
 * fetched, a chain that ended in it would end in nothing, and the screen
 * would show raw keys.
 */
export function fallbackLocales(defaultLocale: Locale): Locale[] {
  return [...new Set([defaultLocale, BUNDLED_LOCALE])]
}
export const LOCALE_STORAGE_KEY = 'comi.locale'

/**
 * Where the language comes from on startup, and where a choice is kept.
 *
 * localStorage FIRST, then the browser. The brief says "detect the browser
 * language, store the choice", but those two cannot both hold in this order:
 * the detector returns the first source that yields a supported language, and
 * `navigator` always yields one. With navigator first, the stored value gets
 * written on every change and then never read, so the language picker appears
 * to do nothing after a reload. This order is what the requirement actually
 * describes: fall back to the phone's language on a first visit, and remember
 * an explicit choice afterwards.
 *
 * SHORT CODES ONLY. The browser says `es-ES`, and i18next keeps whatever it is
 * handed as `i18n.language` and writes it to `comi.locale` as it is. The
 * strings it reads are `es` either way, but the language asked for was then a
 * name that no chunk has, and a late `es` went unrecognised (`late.ts`). Cut
 * here, a tag stored before by an older version is repaired on the next start.
 */
export const DETECTION = {
  order: ['localStorage', 'navigator'],
  caches: ['localStorage'],
  lookupLocalStorage: LOCALE_STORAGE_KEY,
  convertDetectedLanguage: (tag: string) => tag.split(/[-_]/)[0]?.toLowerCase() ?? tag,
} satisfies DetectorOptions

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

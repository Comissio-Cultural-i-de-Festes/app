import type { i18n as I18n, ResourceKey } from 'i18next'

/**
 * A language that arrived after the timeout, and the screen turning to it.
 *
 * By then i18next has given up on it and the fallback language is on screen
 * (`backend.ts`). The strings go into the store, and asking for the same
 * language again fetches nothing but fires `languageChanged`, which is what
 * makes every `useTranslation` redraw.
 *
 * WHICH LANGUAGE IS "THE SAME". It used to be `i18n.language === language`, and
 * a phone in Spanish never matched: `i18n.language` is what was asked for, the
 * browser's `es-ES`, while the chunk that arrives is `es`. The strings were
 * stored and nothing redrew, so the phone stayed in Catalan for the whole
 * session. `i18n.languages` is the chain i18next actually reads from, already
 * reduced to `es` and its fallbacks, so that is where the arrival is looked up.
 * The detector now hands over short codes too (`locales.ts`); this does not
 * depend on it.
 */
export function adoptLateLocale(
  i18n: Pick<I18n, 'addResourceBundle' | 'language' | 'languages' | 'changeLanguage'>,
  language: string,
  resources: ResourceKey,
): void {
  i18n.addResourceBundle(language, 'translation', resources, true, true)
  if (i18n.languages.includes(language)) void i18n.changeLanguage(i18n.language)
}

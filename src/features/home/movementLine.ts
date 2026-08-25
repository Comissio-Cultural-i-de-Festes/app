import type { useTranslation } from 'react-i18next'

import { firstName } from '@/features/session/profile'

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * "S'hi han apuntat avui: Marc, Júlia i 3 més" — two names, then a count.
 *
 * The prototype writes it the other way round, with the names first and their
 * articles: "En Marc, la Júlia i 3 més s'han apuntat avui". Catalan needs to
 * know whether each person is en or la, and this app does not store anybody's
 * gender — asking for it, in two boxes, to win an article is not a trade worth
 * making. After a colon, bare names read as a list rather than as a sentence
 * with something missing.
 *
 * The verb still agrees with how many people there are in total, not with how
 * many are named.
 */
export function movementLine(names: readonly string[], t: Translate): string {
  const shown = names.slice(0, 2).map(firstName)
  const others = names.length - shown.length

  // The "i" belongs to whatever ends the list. With a count after them the two
  // names are separated by a comma, or the line reads "Marc i Júlia i 2 més".
  const listed = shown.join(others > 0 ? t('home.movement.comma') : t('home.movement.and'))
  const people = others > 0 ? t('home.movement.more', { people: listed, count: others }) : listed

  return t('home.movement.line', { people, count: names.length })
}

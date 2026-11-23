import type { TFunction } from 'i18next'

import { formatDateLong, formatTime } from '@/i18n/format'
import type { Locale } from '@/i18n/locales'

import { endsOnOtherDay } from './interval'

/**
 * La línia «Quan» d'un esdeveniment: la fitxa i la vista prèvia de la junta
 * diuen exactament el mateix i no poden divergir.
 *
 * Dues cadenes i no una amb una part opcional: la preposició davant del dia
 * («fins al dimecres», «hasta el miércoles») no és la mateixa que davant de
 * l'hora («fins a les 03:00»), i una plantilla amb forats no s'ho pot permetre.
 */
export function whenText(starts: Date, ends: Date | null, locale: Locale, t: TFunction): string {
  const from = formatDateLong(starts, locale)
  if (ends === null) return from
  if (endsOnOtherDay(starts, ends)) {
    return t('event.facts.untilDay', { from, to: formatDateLong(ends, locale) })
  }
  return t('event.facts.until', { from, to: formatTime(ends, locale) })
}

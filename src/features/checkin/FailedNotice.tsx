import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { daysUntil, formatDayMonth, formatWeekdayLong } from '@/i18n/format'
import { toLocale } from '@/i18n/locales'
import { Notice } from '@/ui/Notice/Notice'

import { type FailedState, forgetFailed } from './failed'
import { checkinQueueKeys } from './useCheckinPending'
import { useFailedCheckin } from './useFailedCheckin'

/**
 * «El fitxatge de dijous no es va poder validar.»
 *
 * Viu a l'Inici i no al bloc de fitxatge a posta: el bloc només existeix
 * mentre la finestra és oberta, i això es descobreix l'endemà. És l'única cosa
 * d'aquesta pantalla que parla del passat, i per això va a sobre de tot.
 *
 * Un de cada vegada, el més vell. Dues persones amb tres fitxatges refusats no
 * existeixen; qui en té un, en té un, i una llista faria semblar que hi ha un
 * problema amb l'app quan el que hi ha és una nit que no va comptar.
 *
 * El to és pla i no acusa. No diu «no eres al lloc», diu on eres i que no
 * s'han sumat punts — és la mateixa regla de copy que la porta.
 */

/** L'estat del servidor és `snake_case`; les claus d'i18n, no. */
const KEYS: Record<FailedState, string> = {
  lluny: 'lluny',
  tancat: 'tancat',
  sense_lloc: 'senseLloc',
  no_hi_es: 'noHiEs',
}

/** A partir d'una setmana, el dia de la setmana ja no situa res. */
const WEEK_DAYS = 6

export function FailedNotice() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const client = useQueryClient()
  const oldest = useFailedCheckin()

  if (oldest === undefined) return null

  const when = new Date(oldest.takenAt)
  const ago = -daysUntil(when)
  const dia = ago <= WEEK_DAYS ? formatWeekdayLong(when, locale) : formatDayMonth(when, locale)

  return (
    // `live` perquè aquest avís entra sol: el drenatge de la cua rep el
    // veredicte després que la pantalla estigui muntada, i llavors apareix.
    <Notice live className="mx-[var(--ds-gutter)] mt-1">
      {t(`checkin.failed.${KEYS[oldest.estat]}`, {
        dia,
        ...(oldest.metres === null ? {} : { metres: oldest.metres }),
      })}
      <button
        type="button"
        onClick={() => {
          forgetFailed(oldest.id)
          void client.invalidateQueries({ queryKey: checkinQueueKeys.failed() })
        }}
        className="mt-5 block min-h-[44px] text-md font-bold text-warning"
      >
        {t('checkin.failed.ok')}
      </button>
    </Notice>
  )
}

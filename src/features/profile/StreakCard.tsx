import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useUserId } from '@/features/session/useUserId'
import { Notice } from '@/ui/Notice/Notice'

import { fetchStreak, profileScreenKeys } from './api'
import { ackStreakBreak, streakShape } from './streak'

/**
 * La ratxa, al perfil.
 *
 * Viu entre els tres números i d'on venen els punts: un fet més sobre tu, al
 * costat dels altres fets sobre tu. No és una alarma i no té color d'alarma.
 *
 * QUATRE ESTATS I NO UN AMB VARIANTS. Zero, una, unes quantes, i trencada. El
 * de trencada és el que decideix si tot això val la pena o fa mal: algú que en
 * portava nou i s'ha posat malalt ha de llegir que nou segueixen sent nou, no
 * que ha perdut alguna cosa. Gris neutre, ni vermell ni ambre — no és cap error
 * ni cap feina pendent — i un botó que el fa marxar per sempre.
 */

const NOTE = 'mt-4 text-sm-lo text-fg-muted-lo [text-wrap:pretty]'

export function StreakCard() {
  const { t } = useTranslation()
  const userId = useUserId()
  const [acked, setAcked] = useState(false)

  const streak = useQuery({
    queryKey: profileScreenKeys.streak(userId),
    queryFn: fetchStreak,
  })

  // Sense dades no hi ha bloc. Un esquelet aquí seria una caixa buida entre
  // dues seccions que ja tenen contingut, i la ratxa no és el que la gent ve a
  // veure al perfil.
  if (streak.data === undefined) return null

  const { actual, millor, perduda, trencada_el } = streak.data
  const shape = acked ? 'cap' : streakShape(streak.data)

  // Quatre frases i no tres. «En marxa» amb zero seria dir-li a algú que té
  // una ratxa quan acaba de perdre-la, i «Comença a la primera que vinguis» a
  // qui en portava dotze seria fer com si no hagués passat res.
  const sub =
    actual === 0
      ? millor > 0
        ? t('streak.bestOnly', { best: millor })
        : t('streak.none.sub')
      : actual === millor
        ? t('streak.best')
        : t('streak.going', { best: millor })

  return (
    <section className="pt-6 px-[var(--ds-gutter)]">
      <h2 className="eyebrow text-fg-muted">{t('streak.title')}</h2>

      {shape === 'trencada' && trencada_el !== null ? (
        <Notice as="div" tone="neutral" className="mt-6">
          <p className="text-base font-bold [text-wrap:pretty]">
            {t('streak.broken.title', { n: perduda })}
          </p>
          <p className="mt-3 text-sm text-fg-muted [text-wrap:pretty]">
            {t('streak.broken.body', { n: perduda })}
          </p>
          <button
            type="button"
            onClick={() => {
              ackStreakBreak(trencada_el)
              setAcked(true)
            }}
            className="mt-4 min-h-[44px] text-md font-bold text-brand-label"
          >
            {t('streak.broken.ok')}
          </button>
        </Notice>
      ) : null}

      <div className="flex items-center gap-7 border-b border-surface-4 pt-6 pb-7">
        <p
          className={
            'display tabular text-d-lg tracking-[-0.05em] leading-[0.9] ' +
            (actual === 0 ? 'text-fg-faint' : '')
          }
        >
          {String(actual)}
        </p>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold [text-wrap:pretty]">
            {actual === 0 ? t('streak.none.label') : t('streak.label', { count: actual })}
          </p>
          <p className="mt-[3px] text-sm-lo text-fg-muted-lo [text-wrap:pretty]">{sub}</p>
        </div>
      </div>

      {/* La regla que fa que això no renyi ningú, escrita a la pantalla i no
          només a la migració: una activitat on la comi et va dir que no, no
          compta ni a favor ni en contra. */}
      <p className={NOTE}>{t('streak.note')}</p>
    </section>
  )
}

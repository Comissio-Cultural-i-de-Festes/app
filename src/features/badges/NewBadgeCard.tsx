import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useUserId } from '@/features/session/useUserId'

import { badgeKeys, fetchMyBadges, markBadgesSeen } from './api'
import { cardOf } from './catalogue'

/**
 * El moment de guanyar-ne una.
 *
 * Cap modal i cap confeti: una targeta que apareix sota la confirmació del
 * fitxatge, al mateix lloc on ja estàs mirant. Si no la toques, no passa res —
 * la insígnia és teva igualment i la trobaràs al perfil.
 *
 * UNA I NOMÉS UNA, encara que n'hi hagi quatre de noves. El primer cop que algú
 * obri l'app després de desplegar això se li repartirà de cop tot el que ja
 * tenia guanyat des del setembre, i una pila de targetes a la porta d'una festa
 * no és una celebració, és una safata d'entrada. S'ensenya la última i la resta
 * l'esperen a la graella.
 */

export function NewBadgeCard() {
  const { t } = useTranslation()
  const userId = useUserId()

  const badges = useQuery({ queryKey: badgeKeys.mine(userId), queryFn: fetchMyBadges })

  // `my_badges()` ja ha tornat, o sigui que la insígnia està repartida i desada.
  // Tancar la bandera aquí és dir «ja l'has vista», i és el que fa que no torni
  // a sortir a la propera festa.
  const newest = (badges.data ?? []).find((b) => b.nova) ?? null
  const has = newest !== null
  useEffect(() => {
    if (has) void markBadgesSeen()
  }, [has])

  if (newest === null) return null
  const card = cardOf(newest.codi)
  if (card === null) return null

  return (
    <div className="selected--soft mt-5 flex items-center gap-7 px-9 py-[15px]">
      <span className="grid size-[56px] flex-none place-items-center border border-brand-banner-border bg-brand-tint-soft text-brand-accent">
        <card.Mark size={30} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow-sm text-brand-accent">{t('badges.new')}</p>
        <p className="mt-2 text-base font-bold [text-wrap:pretty]">
          {t(`badges.${card.key}.title`)}
        </p>
        <p className="mt-[3px] text-[12.5px] text-fg-muted [text-wrap:pretty]">
          {t(`badges.${card.key}.won`)}
        </p>
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { useUserId } from '@/features/session/useUserId'

import { badgeKeys, fetchMyBadges } from './api'
import { CATALOGUE, isEarned, TOTAL_CARDS } from './catalogue'

/**
 * Les insígnies al perfil: quatre marques i una porta.
 *
 * La tira no és la graella retallada, és un recordatori que la graella existeix.
 * Ensenya les quatre primeres que has guanyat i prou; qui no en té cap veu la
 * frase que diu que la primera cau el primer dia, que és la versió honesta de
 * no ensenyar res.
 */

const HOW_MANY = 4

export function BadgeStrip() {
  const { t } = useTranslation()
  const userId = useUserId()

  const badges = useQuery({ queryKey: badgeKeys.mine(userId), queryFn: fetchMyBadges })

  if (badges.data === undefined) return null

  const earned = new Set(badges.data.map((r) => r.codi))
  const mine = CATALOGUE.filter((c) => isEarned(c, earned))

  return (
    <section className="pt-12 px-[var(--ds-gutter)]">
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="eyebrow text-fg-muted">{t('badges.title')}</h2>
        <span className="tabular text-[12.5px] font-bold text-fg-muted-lo">
          {t('badges.count', { n: mine.length, total: TOTAL_CARDS })}
        </span>
      </div>

      <div className="mt-5 flex items-center gap-4">
        {mine.slice(0, HOW_MANY).map((card) => (
          <span
            key={card.key}
            className="grid size-[54px] flex-none place-items-center border border-brand-banner-border bg-brand-tint-soft text-brand-accent"
          >
            <card.Mark size={28} />
          </span>
        ))}

        {mine.length === 0 ? (
          <p className="flex-1 text-sm text-fg-muted-lo [text-wrap:pretty]">
            {t('badges.stripEmpty')}
          </p>
        ) : null}

        <Link
          to="/perfil/insignies"
          className="ml-auto flex min-h-[44px] flex-none items-center text-md font-bold"
        >
          {t('badges.all')}
        </Link>
      </div>
    </section>
  )
}

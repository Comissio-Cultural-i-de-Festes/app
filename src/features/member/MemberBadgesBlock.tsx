import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { CATALOGUE, isEarned, TOTAL_CARDS } from '@/features/badges/catalogue'

import { fetchMemberBadges, memberKeys } from './api'

/**
 * Les insígnies que ha guanyat, i només aquestes.
 *
 * LA DIFERÈNCIA AMB `BadgesScreen` NO ÉS DE MIDA, ÉS DE SENTIT. La graella del
 * teu perfil ensenya les deu targetes, també les que et falten, amb la condició
 * escrita a sota: és el mapa del que es pot fer aquí, i al gener molta gent
 * l'obrirà sense tenir-ne cap. Ensenyar-li a algú les que li falten a un altre
 * és una llista del que aquell altre no ha fet, que és una cosa ben diferent i
 * que ningú ha demanat. Aquí només hi surten les guanyades.
 *
 * Tampoc hi ha full de detall ni «qui més la té»: qui vulgui saber què vol dir
 * una insígnia la té explicada a la seva pròpia graella, amb la condició i el
 * recompte, i duplicar-ho aquí seria mantenir dues versions del mateix text.
 */
export function MemberBadgesBlock({ userId }: { readonly userId: string }) {
  const { t } = useTranslation()

  const badges = useQuery({
    queryKey: memberKeys.badges(userId),
    queryFn: () => fetchMemberBadges(userId),
  })

  if (badges.data === undefined) return null

  const earned = new Set(badges.data.map((r) => r.codi))
  const seves = CATALOGUE.filter((card) => isEarned(card, earned))

  return (
    <section className="px-[var(--ds-gutter)] pt-12">
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="eyebrow text-fg-muted">{t('badges.title')}</h2>
        <span className="tabular text-sm-lo font-bold text-fg-muted-lo">
          {t('badges.count', { n: seves.length, total: TOTAL_CARDS })}
        </span>
      </div>

      {seves.length === 0 ? (
        <p className="mt-5 text-sm text-fg-muted-lo [text-wrap:pretty]">
          {t('member.badges.empty')}
        </p>
      ) : (
        // Una graella i no una fila amb scroll: qui en porta deu les ha de
        // poder veure totes sense arrossegar, i el títol de cada una és el que
        // fa que una marca dibuixada vulgui dir alguna cosa a qui no la té.
        <ul className="mt-5 grid grid-cols-2 gap-5">
          {seves.map((card) => (
            <li key={card.key} className="flex items-center gap-5">
              <span className="grid size-[44px] flex-none place-items-center border border-brand-banner-border bg-brand-tint-soft text-brand-accent">
                <card.Mark size={24} />
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold [text-wrap:pretty]">
                {t(`badges.${card.key}.title`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

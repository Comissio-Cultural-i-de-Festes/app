import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { CATALOGUE, isEarned, TOTAL_CARDS } from '@/features/badges/catalogue'
import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchMemberBadges, sociKeys } from './api'

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
 *
 * L'ESCALA ÉS LA DE `MemberNightsBlock` i no una comprovació sola. Amb un
 * `badges.data === undefined` per a tot, un 500 de `member_badges()` treia el
 * bloc de la pantalla i el soci llegia el mateix que si la persona no en
 * tingués cap: «encara no en té cap» és una frase que aquí no es podia
 * distingir de «no s'ha pogut llegir». El títol es dibuixa des del primer
 * moment perquè és el que fa que el que arribi no salti.
 */
export function MemberBadgesBlock({ userId }: { readonly userId: string }) {
  const { t } = useTranslation()

  const badges = useQuery({
    queryKey: sociKeys.badges(userId),
    queryFn: () => fetchMemberBadges(userId),
  })

  const earned = new Set((badges.data ?? []).map((r) => r.codi))
  const seves = CATALOGUE.filter((card) => isEarned(card, earned))

  return (
    <section className="px-[var(--ds-gutter)] pt-12">
      <div className="flex items-baseline justify-between gap-5">
        <h2 className="eyebrow text-fg-muted">{t('badges.title')}</h2>
        {/* El recompte no surt fins que hi ha resposta: «0 de 12» mentre encara
            es demanen és una xifra que es llegeix i resulta ser una altra. */}
        {badges.data === undefined ? null : (
          <span className="tabular text-sm-lo font-bold text-fg-muted-lo">
            {t('badges.count', { n: seves.length, total: TOTAL_CARDS })}
          </span>
        )}
      </div>

      {badges.isPending ? (
        <Skeleton className="mt-5 grid grid-cols-2 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex items-center gap-5">
              <SkeletonBar w="w-[44px]" h="h-[44px]" />
              <SkeletonBar w="w-[70%]" h="h-[12px]" />
            </span>
          ))}
        </Skeleton>
      ) : badges.isError ? (
        <p role="alert" className="mt-5 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(badges.error))}
        </p>
      ) : seves.length === 0 ? (
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

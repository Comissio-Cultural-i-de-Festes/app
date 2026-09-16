import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { fetchMemberStreak, sociKeys } from './api'

/**
 * La ratxa d'una altra persona.
 *
 * DOS ESTATS I NO QUATRE, i és l'única diferència de debò amb `StreakCard`. Al
 * teu perfil n'hi ha quatre perquè un d'ells —«trencada»— és un avís que
 * arriba una vegada, es llegeix i marxa: està escrit per consolar qui en
 * portava nou i s'ha posat malalt. Aquell avís no és per a ningú més. Dir-li a
 * un tercer «la seva ratxa s'ha quedat a 9» és xafarderia, i el botó
 * d'«Entesos» seria tancar un avís que no és seu. El que queda és el número i
 * la millor marca, que és el que la gent ve a mirar.
 *
 * Amb `null` no hi ha bloc: la funció torna null quan la persona ja no és
 * sòcia, i la capçalera de la pantalla ja ho ha dit.
 */
export function MemberStreakCard({ userId }: { readonly userId: string }) {
  const { t } = useTranslation()

  const streak = useQuery({
    queryKey: sociKeys.streak(userId),
    queryFn: () => fetchMemberStreak(userId),
  })

  if (streak.data == null) return null

  const { actual, millor } = streak.data

  // Tres frases i no dues. «La seva millor marca: 3» a qui en porta 3 ara
  // mateix seria dir dues vegades el mateix número amb dos noms diferents.
  const sub =
    millor === 0
      ? t('member.streak.never')
      : actual === millor
        ? t('member.streak.bestNow')
        : t('member.streak.best', { best: millor })

  return (
    <section className="px-[var(--ds-gutter)] pt-6">
      <h2 className="eyebrow text-fg-muted">{t('streak.title')}</h2>

      <div className="flex items-center gap-7 border-b border-surface-4 pt-6 pb-7">
        <p
          className={
            'display tabular text-d-lg leading-[0.9] tracking-[-0.05em] ' +
            (actual === 0 ? 'text-fg-faint' : '')
          }
        >
          {String(actual)}
        </p>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold [text-wrap:pretty]">
            {actual === 0 ? t('member.streak.none') : t('streak.label', { count: actual })}
          </p>
          <p className="mt-[3px] text-sm-lo text-fg-muted-lo [text-wrap:pretty]">{sub}</p>
        </div>
      </div>
    </section>
  )
}

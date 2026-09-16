import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { errorKey } from '@/lib/errors'
import { Skeleton, SkeletonBar } from '@/ui/Skeleton/Skeleton'

import { fetchMemberStreak, memberKeys } from './api'

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
 * TRES SORTIDES BUIDES I NO UNA, que era el forat de la primera versió. Un
 * `streak.data == null` sol aplega «encara no ha arribat», «ha petat» i «ja no
 * és sòcia», i les tres desapareixien igual: si `member_streak` feia 500, el
 * bloc no hi era i el que es llegia era «no té ratxa». Dir un número que no
 * s'ha pogut llegir és pitjor que dir que no s'ha pogut llegir.
 *
 * Amb `null` de debò —la funció el torna quan la persona ja no és sòcia— sí que
 * no hi ha bloc: la capçalera de la pantalla ja ho ha dit una vegada.
 */
export function MemberStreakCard({ userId }: { readonly userId: string }) {
  const { t } = useTranslation()

  const streak = useQuery({
    queryKey: memberKeys.streak(userId),
    queryFn: () => fetchMemberStreak(userId),
  })

  if (streak.isPending) {
    return (
      <section className="px-[var(--ds-gutter)] pt-6">
        <h2 className="eyebrow text-fg-muted">{t('streak.title')}</h2>
        {/* L'esquelet té la mida del bloc de debò —el número gros a l'esquerra i
            les dues línies al costat— perquè el que arribi no empenyi les
            insígnies cap avall. És l'única manera que la pantalla no salti. */}
        <Skeleton className="flex items-center gap-7 border-b border-surface-4 pt-6 pb-7">
          <SkeletonBar w="w-[54px]" h="h-[44px]" />
          <span className="min-w-0 flex-1">
            <SkeletonBar w="w-[60%]" h="h-[14px]" />
            <SkeletonBar w="w-[40%]" h="h-[11px]" className="mt-[6px]" />
          </span>
        </Skeleton>
      </section>
    )
  }

  if (streak.isError) {
    return (
      <section className="px-[var(--ds-gutter)] pt-6">
        <h2 className="eyebrow text-fg-muted">{t('streak.title')}</h2>
        <p role="alert" className="py-8 text-md font-bold text-error [text-wrap:pretty]">
          {t(errorKey(streak.error))}
        </p>
      </section>
    )
  }

  if (streak.data === null) return null

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

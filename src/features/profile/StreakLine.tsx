import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useUserId } from '@/features/session/useUserId'

import { fetchStreak, profileScreenKeys } from './api'
import { streakIsAtStake } from './streak'

/**
 * «Portes 7 seguides. Aquesta hi compta.»
 *
 * L'ÚNICA COSA DE TOTA LA FASE QUE EMPENY, i per això és una línia de text sota
 * una pregunta que ja hi era i no un avís, ni una notificació, ni una insistència
 * el dia abans. Es diu una vegada, allà on ja estàs decidint si hi vas, i si
 * contestes o passa el dia no torna a sortir perquè el bloc sencer desapareix.
 *
 * Amb zero no diu res. «Comença una ratxa» a algú que encara no ha vingut mai és
 * demanar-li una cosa que no vol, i és exactament la persona que aquesta fase
 * intenta no fer fora.
 */
export function StreakLine() {
  const { t } = useTranslation()
  const userId = useUserId()

  const streak = useQuery({
    queryKey: profileScreenKeys.streak(userId),
    queryFn: fetchStreak,
  })

  if (!streakIsAtStake(streak.data)) return null

  return (
    <p className="mt-4 text-sm text-fg-muted [text-wrap:pretty]">
      {t('streak.atStake', { n: streak.data?.actual ?? 0 })}
    </p>
  )
}

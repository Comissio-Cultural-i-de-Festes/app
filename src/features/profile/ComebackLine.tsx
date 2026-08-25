import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useUserId } from '@/features/session/useUserId'

import { fetchStreak, profileScreenKeys } from './api'

/**
 * «La teva millor ratxa és de 7. La primera que vinguis, en comences una altra.»
 *
 * L'objectiu de negoci és el segon trimestre, i qui s'ha despenjat obre l'Inici
 * i veu exactament el mateix que tothom. La ratxa —quatre estats molt ben
 * resolts— viu al Perfil, que és on aquesta persona justament no entra.
 *
 * Una línia i no una targeta, i cap ambre: l'ambre és perill en aquesta app i
 * no haver vingut no ho és. El to és el de la StreakCard quan una ratxa es
 * trenca —constata, no renya— i per això parla del rècord i no de l'absència.
 *
 * Es busca les seves pròpies dades i es plega sola, com la StreakLine, així que
 * entra a l'Inici en una línia. Amb `millor` a zero no diu res: a qui no ha
 * vingut mai no se li pot recordar cap ratxa.
 */
export function ComebackLine() {
  const { t } = useTranslation()
  const userId = useUserId()

  const streak = useQuery({
    queryKey: profileScreenKeys.streak(userId),
    queryFn: fetchStreak,
  })

  const best = streak.data?.millor ?? 0
  if (streak.data?.actual !== 0 || best === 0) return null

  return (
    <p className="mt-4 text-md-lo text-fg-muted [text-wrap:pretty]">
      {t('home.rank.comeback', { best })}
    </p>
  )
}

import { useQuery } from '@tanstack/react-query'

import { useUserId } from '@/features/session/useUserId'
import { useAvailability } from '@/lib/useAvailability'

import { fetchStreak, profileScreenKeys } from './api'

/**
 * La ratxa que es recorda a qui s'ha despenjat, i si encara pot arribar.
 *
 * Viu en un hook i no dins de `ComebackLine` perquè el rànquing de l'Inici ha
 * de saber-ho abans de pintar-se: la línia es munta sota el rànquing, de
 * manera que la consulta no sortia fins que el rànquing havia arribat, i quan
 * per fi arribava empenyia tot el que hi havia a sota. Demanada des de dalt,
 * va en paral·lel i el bloc entra sencer.
 *
 * `loading` s'acaba sol si la consulta no arriba (sense xarxa, penjada,
 * error): en aquell cas no hi ha línia, que és el que ja passava.
 */
export function useComeback(): { readonly loading: boolean; readonly best: number | null } {
  const userId = useUserId()
  const streak = useQuery({
    queryKey: profileScreenKeys.streak(userId),
    queryFn: fetchStreak,
  })
  const view = useAvailability(streak)

  const best = streak.data?.millor ?? 0
  return {
    loading: view.loading,
    best: streak.data?.actual === 0 && best > 0 ? best : null,
  }
}

import { useQuery } from '@tanstack/react-query'

import { type FailedCheckin, failedCheckins } from './failed'
import { checkinQueueKeys } from './useCheckinPending'

/**
 * El refús més vell que encara no s'ha llegit.
 *
 * Per react-query i no per `useState`, i el motiu és una seqüència concreta:
 * el drenatge de la cua viu a l'arrel de l'app i s'engega en carregar, cada
 * vint segons i en tornar la xarxa —o sigui, just DESPRÉS que aquesta pantalla
 * s'hagi muntat. El cas normal és exactament aquest: obres l'app l'endemà amb
 * wifi, la cua surt, el servidor diu «lluny», `rememberFailed()` ho desa. Amb
 * una fotografia del muntatge, l'avís no sortia fins a la següent obertura, i
 * la feina de dir-ho el mateix dia quedava sense fer.
 *
 * L'`invalidateQueries()` sense clau del drenatge ja recull aquesta consulta,
 * igual que fa amb el rètol de pendents del costat.
 */
export function useFailedCheckin(): FailedCheckin | undefined {
  const failed = useQuery({
    queryKey: checkinQueueKeys.failed(),
    queryFn: () => failedCheckins(),
  })

  return failed.data?.[0]
}

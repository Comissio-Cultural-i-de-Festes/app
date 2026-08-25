import { useQuery } from '@tanstack/react-query'

import { HERE, count } from '@/lib/queue'
import { useOnline } from '@/lib/useOnline'

/**
 * Quants fitxatges esperen encara sortir.
 *
 * Només compta. La porta i les idees tenen cadascuna un hook que compta I
 * drena, i aquest no en té cap necessitat: `useCheckinQueue` ja drena des de
 * l'arrel de l'app —cada vint segons, en tornar la xarxa i en carregar— perquè
 * el cas normal és prémer el botó i guardar-se el mòbil sense tornar a mirar
 * cap pantalla. Un quart bucle de vint segons aquí seria un segon rellotge
 * dient el mateix.
 *
 * Va per react-query i no per estat local justament per això: quan el drenatge
 * de l'arrel envia alguna cosa, invalida les consultes, i aquesta se n'assabenta
 * sense que ningú les hagi de connectar. Amb `useState` el rètol es quedaria
 * dient «1 pendent» després d'haver-lo enviat.
 */

export const checkinQueueKeys = {
  pending: () => ['checkin', 'pending'] as const,
}

export interface CheckinPending {
  readonly queued: number
  readonly online: boolean
}

export function useCheckinPending(): CheckinPending {
  const online = useOnline()

  const queued = useQuery({
    queryKey: checkinQueueKeys.pending(),
    queryFn: () => count(HERE),
  })

  return { queued: queued.data ?? 0, online }
}

import { useQuery } from '@tanstack/react-query'

import { IN_PROGRESS_MS } from '@/features/home/api'
import type { EventRow } from '@/lib/schema'

import { type Night, fetchNights, photoKeys } from './api'
import { shouldOfferExitPhoto, wasDismissed } from './exitCard'

/**
 * Si la targeta de «fes-te la de sortida» té res a dir, i sobre quina nit.
 *
 * Surt del component perquè l'Inici ho ha de saber SENSE renderitzar-la: per
 * damunt del hero només hi cap un avís, i triar-lo vol dir preguntar a cada
 * candidat si en té cap. La targeta segueix cridant aquest mateix hook, i com
 * que comparteixen clau, react-query no fa cap consulta de més.
 *
 * El «ara no» va per consulta i no per estat local. Viu a `localStorage`, on
 * cap component es pot subscriure, i abans un `useState` dins la targeta feia
 * que qui mirés des de fora no se n'assabentés mai. És el mateix idioma que
 * els fitxatges refusats.
 */

export interface ExitOffer {
  readonly event: EventRow
  readonly night: Night
}

export function useExitOffer(event: EventRow | null): ExitOffer | null {
  const nights = useQuery({
    queryKey: photoKeys.nights(),
    queryFn: fetchNights,
    enabled: event !== null,
  })

  const dismissed = useQuery({
    queryKey: photoKeys.exitDismissed(event?.id ?? ''),
    queryFn: () => wasDismissed(event?.id ?? ''),
    enabled: event !== null,
  })

  const night = nights.data?.find((n) => n.event_id === event?.id)

  // `dismissed` encara sense resposta vol dir que no ho sabem: millor no
  // oferir-la un frame i haver-la de retirar.
  if (event === null || night === undefined || dismissed.data !== false) return null
  if (!shouldOfferExitPhoto(endOf(event), night.exit_photo_url !== null, event.id)) return null

  return { event, night }
}

/** When the party was over, which is not when it started. */
function endOf(event: EventRow): Date {
  return new Date(event.ends_at ?? new Date(event.starts_at).getTime() + IN_PROGRESS_MS)
}

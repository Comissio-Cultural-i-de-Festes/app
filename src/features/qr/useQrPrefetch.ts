import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useMyProfile } from '@/features/session/useMyProfile'
import { useUserId } from '@/features/session/useUserId'

import { qrQuery, readCachedToken } from './api'

/**
 * El QR, desat abans que faci falta.
 *
 * Fins ara el codi només es baixava en obrir la pantalla del QR, i el text
 * d'aquella pantalla ho demanava: «obre-la un cop amb connexió». Qui instal·la
 * l'app a la casa rural no l'ha oberta mai, i el dia que la necessita és a la
 * porta, sense cobertura. Ara es baixa en entrar, sense que ningú ho demani.
 *
 * NOMÉS PER A UN SOCI ACTIU. A un pendent o a qui és de baixa el servidor no li
 * dona codi, i preguntar-li-ho seria una petició per sentir «no».
 *
 * NOMÉS SI NO EN TÉ CAP DE DESAT. El codi no canvia si ningú el rota, i la
 * pantalla del QR ja el refresca quan s'obre. Un cop desat, això no torna a
 * sortir a la xarxa mai més. Si falla —entrar amb mala cobertura és el cas
 * normal—, ho torna a provar la propera vegada que el perfil es refresqui, que
 * és quan hi ha senyal que alguna cosa ha arribat.
 */
export function useQrPrefetch(): void {
  const userId = useUserId()
  const client = useQueryClient()
  const { data: profile, dataUpdatedAt } = useMyProfile()
  const active = profile?.estat === 'actiu'

  useEffect(() => {
    if (!active || readCachedToken(userId) !== null) return
    void client.prefetchQuery(qrQuery(userId))
  }, [client, userId, active, dataUpdatedAt])
}

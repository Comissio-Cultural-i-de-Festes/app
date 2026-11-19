import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'

import type { MyProfile } from '@/features/session/profile'
import { useUserId } from '@/features/session/useUserId'

import { readStartHint, startPlan, writeStartHint } from './startHint'
import { prefetchHome, prefetchJunta } from './startPrefetch'

/**
 * Posa en marxa l'arrencada en paral·lel i recorda per a la propera.
 *
 * Penja de la porta del primer cop perquè és el primer que es munta amb sessió:
 * és l'únic lloc des d'on les consultes surten a la vegada que el perfil. Només
 * mira la ruta en muntar-se; la porta no es desmunta en navegar, i el que es
 * demana després ho fa cada pantalla.
 */
export function useStartPrefetch(profile: MyProfile | null | undefined): void {
  const client = useQueryClient()
  const userId = useUserId()
  const { pathname } = useLocation()
  const [first] = useState(pathname)

  useEffect(() => {
    const plan = startPlan(first, readStartHint(userId))
    if (plan === 'home') void prefetchHome(client, userId)
    if (plan === 'junta') void prefetchJunta(client)
  }, [client, userId, first])

  useEffect(() => {
    if (profile) writeStartHint(userId, profile)
  }, [userId, profile])
}

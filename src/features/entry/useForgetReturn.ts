import { useEffect } from 'react'

import { forgetReturn } from './returnTo'

/**
 * Si s'ha entrat sense passar per Google —el codi del correu— ja som a la
 * fitxa, i el que hi havia desat no ha de tornar-se a fer servir en tocar
 * l'Inici més tard. Només es mira en el moment d'entrar: més endavant la ruta
 * pot ser `/primer-cop`, que és d'on la torna a desar `RequireOnboarding`.
 */
export function useForgetReturn(userId: string | null): void {
  useEffect(() => {
    if (userId !== null && window.location.pathname !== '/') forgetReturn()
  }, [userId])
}

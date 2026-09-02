import { useState } from 'react'

import { useMyProfile } from './useMyProfile'

/**
 * Si hi ha banda de pendent, i si està plegada.
 *
 * En un fitxer propi i no dins de `PendingBanner.tsx`: allà hi hauria un
 * component i un hook exportats del mateix mòdul, que és el que trenca el fast
 * refresh —la mateixa regla que fa que la lògica pura visqui al costat del seu
 * test i no dins de la pantalla.
 *
 * L'estat el llegeixen dos components, perquè `TabLayout` ha de saber si posa
 * `.with-banner`: amb la banda desplegada el coixí no toca, i amb dos
 * `useState` separats el commutador no es veuria a l'altre costat.
 */

const KEY = 'comi.pending.collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Safari en privat llança en llegir. Desplegada és el pitjor cas
    // acceptable; no poder pintar la banda, no.
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  } catch {
    /* El plec és una comoditat. Si no es pot desar, la banda encara funciona. */
  }
}

export function usePendingBanner() {
  const { data: profile } = useMyProfile()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  return {
    /** Si hi ha banda. `'baixa'` no en té: vegeu la nota de dalt. */
    showing: profile?.estat === 'pendent',
    collapsed,
    collapse: (next: boolean) => {
      setCollapsed(next)
      writeCollapsed(next)
    },
  }
}

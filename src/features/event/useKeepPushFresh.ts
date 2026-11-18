import { useEffect } from 'react'

import { useUserId } from '@/features/session/useUserId'

import { ensureSubscriptionSaved, pushGranted } from './push'

/**
 * Comprovar la subscripció de push en arrencar, un cop per usuari i sessió.
 *
 * VIU A L'ARREL I NO A LA TARGETA DE L'ESDEVENIMENT. Qui es va subscriure
 * abans que la clau VAPID canviés no obre cap esdeveniment sense revelar per
 * saber-ho, i mentrestant cada avís seu es perd. Només actua si el permís ja
 * està concedit: no demana res a ningú.
 *
 * Només es dóna per fet si ha anat bé: arrencar sense cobertura és el cas
 * normal d'una PWA, i el reintent és el retorn de la xarxa. Va per usuari
 * perquè la subscripció s'atribueix a qui hi és en desar-la.
 */
let checkedFor: string | null = null

export function useKeepPushFresh(): void {
  const userId = useUserId()

  useEffect(() => {
    const run = () => {
      if (checkedFor === userId || !pushGranted()) return
      void ensureSubscriptionSaved().then((ok) => {
        if (ok) checkedFor = userId
      })
    }
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [userId])
}

/** Només per a les proves: cada cas arrenca com una sessió nova. */
export function resetKeepPushFresh(): void {
  checkedFor = null
}

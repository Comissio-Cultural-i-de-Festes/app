import { useEffect } from 'react'

import { ensureSubscriptionSaved, pushGranted } from './push'

/**
 * Comprovar la subscripció de push un cop per sessió, a l'arrencada.
 *
 * VIU A L'ARREL I NO A LA TARGETA DE L'ESDEVENIMENT. Qui es va subscriure
 * abans que la clau VAPID canviés no obre cap esdeveniment sense revelar per
 * saber-ho, i mentrestant cada avís seu es perd. Només actua si el permís ja
 * està concedit: no demana res a ningú.
 *
 * Un flag de mòdul i no de component: StrictMode munta dos cops i la
 * comprovació, si refà la subscripció, no s'ha de fer dues vegades.
 */
let checked = false

export function useKeepPushFresh(): void {
  useEffect(() => {
    if (checked || !pushGranted()) return
    checked = true
    void ensureSubscriptionSaved()
  }, [])
}

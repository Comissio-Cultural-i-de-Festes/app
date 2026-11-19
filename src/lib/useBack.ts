import type { MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * La fletxa d'enrere que fa enrere de debò.
 *
 * Una fletxa que sempre porta a l'Inici menteix a qui ha arribat des del
 * Rànquing o des d'una altra pantalla: el porta on no volia. Però `navigate(-1)`
 * a seques és pitjor encara per a qui obre un enllaç compartit, perquè aquella
 * és la primera pàgina de la sessió i enrere és sortir de l'app.
 *
 * La clau d'una ubicació és `default` només a la primera entrada de la sessió;
 * qualsevol altra ha estat visitada dins l'app i, per tant, hi ha on tornar.
 * `onClick` s'ha de posar en un `<Link to={fallback}>`: sense historial no fa
 * res i l'enllaç porta al destí fix; amb clic modificat (nova pestanya) tampoc.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  const canGoBack = useLocation().key !== 'default'

  return {
    canGoBack,
    back: () => void (canGoBack ? navigate(-1) : navigate(fallback, { replace: true })),
    onClick: (event: MouseEvent) => {
      if (!canGoBack) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      void navigate(-1)
    },
  }
}

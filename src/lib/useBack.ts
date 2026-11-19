import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router'

/**
 * La fletxa d'enrere que fa enrere de debò.
 *
 * Una fletxa que sempre porta a l'Inici menteix a qui ha arribat des del
 * Rànquing o des d'una altra pantalla. Però `navigate(-1)` a seques és pitjor
 * per a qui obre un enllaç compartit: aquella és la primera pàgina de la
 * sessió i enrere és sortir de l'app.
 *
 * Es mira `history.state.idx`, que react-router posa a 0 a la primera entrada
 * i que un `replace` conserva. La clau de la ubicació no serveix: un
 * `Navigate replace` (el retorn de Google, l'onboarding) en genera una de
 * nova a la mateixa primera entrada, i enrere seria sortir de l'app. Sense
 * `state` (cap entrada del router) tampoc no es pot tornar.
 *
 * `back()` és per als botons; `onClick` va en un `<Link to={fallback}>`: sense
 * historial no fa res i l'enllaç porta al destí fix, i amb clic modificat
 * (nova pestanya) tampoc.
 */
export function canGoBack(): boolean {
  const state = window.history.state as { idx?: unknown } | null
  const idx = state?.idx
  return typeof idx === 'number' && idx > 0
}

export function useBack(fallback = '/') {
  const navigate = useNavigate()

  return {
    back: () => void (canGoBack() ? navigate(-1) : navigate(fallback, { replace: true })),
    onClick: (event: MouseEvent) => {
      if (!canGoBack()) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      void navigate(-1)
    },
  }
}

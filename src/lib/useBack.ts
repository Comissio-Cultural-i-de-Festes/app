import { type MouseEvent, useEffect, useRef } from 'react'
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
 * `back()` és per als botons; `onClick` va en un `<Link to={fallback}>` (que
 * conserva l'`href` per a la nova pestanya) i sense historial fa `replace` al
 * destí, perquè un `push` hi deixaria una entrada de més.
 */
export function canGoBack(): boolean {
  const state = window.history.state as { idx?: unknown } | null
  const idx = state?.idx
  return typeof idx === 'number' && idx > 0
}

export function useBack(fallback = '/') {
  const navigate = useNavigate()
  const mounted = useRef(false)

  // Una mutació que desa acaba, a vegades, després que la persona hagi tocat
  // la fletxa: aquell `back()` ja no és el d'aquesta pantalla i faria un enrere
  // de més. Un cop desmuntada, no fa res.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const leave = () => void (canGoBack() ? navigate(-1) : navigate(fallback, { replace: true }))

  return {
    back: () => {
      if (mounted.current) leave()
    },
    // Anar al destí fix sense passar per l'historial, amb la mateixa guarda.
    replace: () => {
      if (mounted.current) void navigate(fallback, { replace: true })
    },
    // Sempre s'atura l'enllaç: si no hi hagués historial, deixar-lo seguir
    // faria un push al pare, i la fletxa del pare (`-1`) tornaria aquí en bucle.
    onClick: (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      event.preventDefault()
      leave()
    },
  }
}

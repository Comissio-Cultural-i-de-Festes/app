import { type RefObject, useEffect } from 'react'

/**
 * Fer que una capa sigui un diàleg de debò.
 *
 * Escape que tanca, el tabulador que no se'n va a passejar per la pantalla de
 * sota, el fons que no fa scroll sota el dit, i el focus que torna al botó que
 * el va obrir. Res d'això es veu a cap disseny i tot es nota quan falta.
 *
 * Existia sencer al `Sheet` i no existia gens al visor de fotos, que és
 * `role="dialog"` igualment: dos diàlegs, dos comportaments, i el segon
 * mentint als lectors de pantalla. La feina difícil ja estava feta —només
 * estava feta en un sol lloc.
 *
 * LA PILA. El visor obre el full de denúncia a dins seu, així que hi ha dos
 * diàlegs oberts alhora amb un escoltador cadascun a `window`: sense la pila,
 * una sola pulsació d'Escape els tancava tots dos, i el tabulador quedava
 * atrapat per dues trampes que es contradeien. Només el de dalt escolta.
 *
 * No gestiona les fletxes ni cap altra tecla: qui les vulgui es posa el seu
 * propi escoltador al costat, que és el que fa el visor per passar de foto.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/** Els diàlegs oberts, del primer al de més amunt. */
const stack: object[] = []

export function useModalFocus(panel: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const me = {}
    stack.push(me)

    const opener = document.activeElement
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'

    // El primer element que es pot enfocar, i si no n'hi ha cap, el panell.
    // Sense això el focus es queda al botó de sota i el teclat segueix parlant
    // amb una pantalla que ja no es veu.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return

      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || panel.current === null) return

      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (firstItem === undefined || lastItem === undefined) return

      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(me), 1)
      root.style.overflow = before
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [panel, onClose])
}

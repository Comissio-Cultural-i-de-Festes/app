/**
 * El codi de l'enllaç, mentre no s'ha pogut bescanviar.
 *
 * L'adreça no és prou lloc. El primer cop navega a `/primer-cop` i la query se
 * n'hi va, i amb mala cobertura el bescanvi encara no ha arribat al servidor:
 * el codi desapareixia de l'única banda on era, i la persona quedava pendent
 * amb l'enllaç bo encara al WhatsApp.
 *
 * `sessionStorage` i no `localStorage`: és d'aquesta pestanya i prou, que és on
 * ha arribat l'enllaç, i no sobreviu a tancar-la. La icona de l'iPhone té el
 * seu propi magatzem i no el veurà mai, i és correcte: allà ja s'hi entra com
 * algú que l'ha bescanviat al Safari.
 *
 * S'escriu abans de la petició, com les cues: si la petició no torna, el codi
 * ja és a lloc.
 */

import { INVITE_PARAM } from './useInvite'

const KEY = 'comi.invite.pending'

export function rememberInvite(code: string): void {
  try {
    sessionStorage.setItem(KEY, code)
  } catch {
    // Emmagatzematge bloquejat: queda l'adreça, com abans.
  }
}

export function pendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetInvite(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Les dues bandes on viu el codi, de cop: el bescanvi que ha contestat, o la
 * sessió que es tanca. Esborrar només el desat deixava el `?codi=` a la barra,
 * i el compte següent d'aquesta pestanya se'l quedava igual.
 */
export function discardInvite(): void {
  forgetInvite()
  const url = new URL(window.location.href)
  if (!url.searchParams.has(INVITE_PARAM)) return
  url.searchParams.delete(INVITE_PARAM)
  window.history.replaceState(window.history.state, '', url.toString())
}

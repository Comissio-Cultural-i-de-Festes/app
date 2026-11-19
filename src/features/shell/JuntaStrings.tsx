import { type ReactNode, use } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'

import { juntaStrings } from '@/i18n/junta'

import { isDoorPath } from './doorRoutes'

/**
 * Les pantalles d'escriptori de la junta, quan ja tenen els seus textos.
 *
 * Els textos d'aquestes pantalles no viatgen amb l'app (`build/localeSplit.ts`):
 * arriben la primera vegada que se n'obre una, en l'idioma que hi ha a la
 * pantalla. Fins aleshores aquí se suspèn, i es veu l'espera de la zona, la
 * mateixa que mentre arriba el tros de la pantalla. Pintar abans seria ensenyar
 * claus crues, o un instant de text en català a qui llegeix en castellà.
 *
 * Si l'idioma canvia, se suspèn una altra vegada fins que arriba el del nou.
 *
 * Si no arriben, o triguen massa, el recull `JuntaScreenBoundary` i diu que la
 * pantalla necessita cobertura, també amb una wifi connectada que no dona
 * internet (`src/i18n/junta.ts`).
 *
 * LA PORTA NO ESPERA. El rebedor, l'escàner, l'alta a mà, els punts i la cua de
 * la gimcana porten tots els seus textos dins de l'app, i no poden dependre de
 * res que no sigui a la precache: a la porta de la casa rural no hi ha cobertura.
 * Quines són, a `doorRoutes.ts`.
 */
export function JuntaStrings({ children }: { readonly children: ReactNode }) {
  const { pathname } = useLocation()
  if (isDoorPath(pathname)) return children
  return <Waiting>{children}</Waiting>
}

function Waiting({ children }: { readonly children: ReactNode }) {
  const { i18n } = useTranslation()
  use(juntaStrings(i18n, i18n.resolvedLanguage ?? i18n.language))
  return children
}

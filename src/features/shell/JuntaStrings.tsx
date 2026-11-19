import { type ReactNode, use } from 'react'
import { useTranslation } from 'react-i18next'
import { matchPath, useLocation } from 'react-router'

import { juntaStrings } from '@/i18n/junta'

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
 * Si no arriben, l'error és el d'un tros que no hi és, i el recull
 * `JuntaScreenBoundary` com el de qualsevol pantalla que no és al mòbil: sense
 * xarxa diu que cal xarxa, i amb xarxa recarrega.
 *
 * LA PORTA NO ESPERA. El rebedor, l'escàner, l'alta a mà, els punts i la cua de
 * la gimcana porten tots els seus textos dins de l'app, i no poden dependre de
 * res que no sigui a la precache: a la porta de la casa rural no hi ha cobertura.
 * Si mai una pantalla de la porta no fos en aquesta llista, esperaria els textos
 * com les d'escriptori: amb xarxa no es notaria, i sense, sortiria que cal xarxa
 * fins que algú hi hagués entrat amb cobertura.
 */
const DOOR = [
  '/junta',
  '/junta/escaner/:eventId',
  '/junta/alta/:eventId',
  '/junta/punts/:eventId',
  '/junta/gimcana/:eventId',
]

function isDoorPath(pathname: string): boolean {
  return DOOR.some((path) => matchPath(path, pathname) !== null)
}

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

import { errorKey } from './errors'

/**
 * Si una consulta té alguna cosa per ensenyar, i si no, per què.
 *
 * SENSE XARXA, REACT QUERY NO FALLA: PAUSA. Una consulta que encara no té dades
 * i perd la cobertura queda amb `status: 'pending'` i `fetchStatus: 'paused'`
 * fins que torni la xarxa, i les pantalles preguntaven `isPending ? esquelet :
 * isError ? missatge : dades`. `isError` no arriba mai, o sigui que l'esquelet
 * era per sempre i els missatges d'error que hi havia preparats no sortien
 * enlloc. Aquí «en pausa sense dades» és un estat amb nom, que és el que li
 * faltava per poder-se pintar.
 *
 * LA XARXA QUE NO CONTESTA ÉS L'ALTRA MEITAT. Una wifi saturada o un portal
 * captiu diuen que hi ha xarxa i no tornen res, i aleshores la consulta està
 * `fetching` sense data de caducitat: el `fetch` del navegador no en té. No hi
 * ha cap error per atrapar, només un rellotge, i qui el porta és el hook del
 * costat; aquí només arriba ja decidit (`stalled`).
 *
 * L'ERROR VA ABANS QUE LES DADES, com ja feien les pantalles: un refresc que
 * falla amb dades a la cau continua sent un error que s'ha de dir. Una pausa
 * amb dades, en canvi, no ho és —el que hi ha a la cau és el que s'ha de
 * veure sota terra—, i per això la pausa només compta quan falten.
 *
 * Accepta més d'una consulta perquè l'Inici en necessita dues per pintar
 * res, i dir «preparat» quan n'ha arribat una és el mateix forat per l'altra.
 */

export type Availability = 'ready' | 'loading' | 'offline' | 'stalled' | 'failed'

export interface QueryState {
  readonly data: unknown
  readonly status: 'pending' | 'error' | 'success'
  readonly fetchStatus: 'fetching' | 'paused' | 'idle'
}

/** Esperant una resposta que encara pot arribar: l'únic cas on el rellotge compta. */
export function isWaiting(queries: readonly QueryState[]): boolean {
  return queries.some((q) => q.data === undefined && q.fetchStatus === 'fetching')
}

export function availabilityOf(
  queries: readonly QueryState[],
  stalled: boolean,
  online = true,
): Availability {
  if (queries.some((q) => q.status === 'error')) return 'failed'
  const missing = queries.filter((q) => q.data === undefined)
  if (missing.length === 0) return 'ready'
  if (missing.some((q) => q.fetchStatus === 'paused')) return 'offline'
  // React Query només s'assabenta que no hi ha xarxa per l'esdeveniment
  // `offline`, i una app que s'obre ja sense cobertura no el rep mai: per a
  // ella hi ha xarxa, la petició surt, peta i es reintenta durant segons.
  // `navigator.onLine === false`, en canvi, no menteix mai en aquest sentit.
  if (!online && isWaiting(missing)) return 'offline'
  if (stalled && isWaiting(missing)) return 'stalled'
  // Inclou la consulta desactivada (`idle` sense dades): no està esperant la
  // xarxa sinó una altra cosa, i qui la desactiva ja sap què ensenya mentre.
  return 'loading'
}

/** La frase per a cada «no hi ha res a ensenyar». */
export function availabilityKey(
  state: Availability,
  error: unknown,
  online = navigator.onLine,
): string {
  if (state === 'stalled') return 'errors.stalled'
  if (state === 'offline') return 'errors.offline'
  return errorKey(error, online)
}

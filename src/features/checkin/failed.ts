/**
 * Els fitxatges que el servidor va refusar mentre ningú mirava.
 *
 * La cua s'envia sola: en carregar l'app, cada vint segons i quan torna la
 * xarxa. Fins ara, quan el servidor contestava «lluny» o «tancat», la cua
 * l'esborrava i no en quedava rastre —la persona havia premut el botó, havia
 * vist «ho enviarem sol», i mai sabia que no tenia els punts. Ho descobria
 * dies després al rànquing, que és exactament la desconfiança que mata una app
 * de punts.
 *
 * Va a `localStorage` i no a la cua d'IndexedDB perquè ja no és feina
 * pendent: és una cosa dita que s'ha de llegir un cop i prou. La cua és per al
 * que encara ha de sortir.
 *
 * No s'esborra sol amb el temps. Si algú no obre l'app en dues setmanes,
 * l'avís hi segueix sent quan torna, que és precisament quan importa.
 */

const KEY = 'comi.checkin.failed'

/** Els veredictes que no són «fitxat». `fet` i `ja_hi_ets` no arriben aquí. */
export type FailedState = 'lluny' | 'tancat' | 'sense_lloc' | 'no_hi_es'

export interface FailedCheckin {
  /** El `client_request_id` del fitxatge, que ja era únic. */
  readonly id: string
  readonly eventId: string
  readonly estat: FailedState
  /** Només per a `lluny`; la resta no en tenen. */
  readonly metres: number | null
  readonly takenAt: number
}

function read(): FailedCheckin[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return []
    const rows: unknown = JSON.parse(raw)
    return Array.isArray(rows) ? (rows as FailedCheckin[]) : []
  } catch {
    // Mode privat, emmagatzematge bloquejat, o un JSON que algú ha tocat a mà.
    return []
  }
}

function write(rows: readonly FailedCheckin[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    // No hi ha res a fer: l'avís no sortirà, i és millor això que petar el
    // drenatge de la cua, que és el que ens ha portat aquí.
  }
}

export function failedCheckins(): FailedCheckin[] {
  return read().sort((a, b) => a.takenAt - b.takenAt)
}

/** Idempotent per `id`: la cua pot reintentar el mateix fitxatge. */
export function rememberFailed(entry: FailedCheckin): void {
  const rows = read().filter((row) => row.id !== entry.id)
  write([...rows, entry])
}

export function forgetFailed(id: string): void {
  write(read().filter((row) => row.id !== id))
}

/**
 * En tancar sessió, com les cues.
 *
 * Diu on eres i quin dia, i el telèfon es comparteix: el motiu pel qual
 * `clearAllQueues()` existeix val igual aquí. Qui entra després no ha de
 * llegir la nit de qui va sortir.
 */
export function clearFailedCheckins(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Res a fer, i tampoc no hi havia res a esborrar.
  }
}

import type { AttendanceState } from '@/lib/model'

import type { AttendanceRow } from './api'

/**
 * El que la pantalla diu en prémer «sí», abans que el servidor respongui.
 *
 * `set_attendance` no sempre registra el que se li demana: un esdeveniment ple
 * deixa en llista d'espera i un que demana confirmació deixa en «sol·licitat».
 * Aquí es prediu amb el que la pantalla ja sap, perquè el salt de «Ets dins» a
 * «Llista d'espera» només passi quan la predicció falla i no cada cop que
 * l'esdeveniment és ple. L'estat de debò és sempre el que torna la crida.
 */
export function expectedState(
  estado: 'si' | 'potser' | 'no',
  { confirm = false, full = false }: { readonly confirm?: boolean; readonly full?: boolean } = {},
): AttendanceState {
  if (estado !== 'si') return estado
  if (confirm) return 'sollicitat'
  return full ? 'espera' : 'si'
}

/**
 * La meva fila amb un estat nou, o una de nova si encara no n'hi havia.
 *
 * El nom i la cara es conserven quan la fila ja hi era. En una de nova hi van
 * els de `profile`, el meu perfil que l'app ja té: amb `null` la cara sortia
 * com l'avatar per defecte fins a la recàrrega.
 */
export function withMyAnswer(
  rows: readonly AttendanceRow[],
  eventId: string,
  userId: string,
  estado: AttendanceState,
  now: Date,
  profile: AttendanceRow['profiles'] = null,
): AttendanceRow[] {
  const has = rows.some((r) => r.event_id === eventId && r.user_id === userId)
  if (has) {
    return rows.map((r) => (r.event_id === eventId && r.user_id === userId ? { ...r, estado } : r))
  }
  return [
    {
      user_id: userId,
      event_id: eventId,
      estado,
      created_at: now.toISOString(),
      profiles: profile,
    },
    ...rows,
  ]
}

/**
 * Torna la meva fila d'un esdeveniment a com era, sense tocar la resta.
 *
 * No es restaura la llista sencera: una altra resposta en vol, d'un altre
 * esdeveniment, ha escrit a la mateixa consulta i una instantània vella la
 * trepitjaria. `previous` és la fila d'abans, o `null` si no n'hi havia.
 */
export function restoreMyRow(
  rows: readonly AttendanceRow[],
  eventId: string,
  userId: string,
  previous: AttendanceRow | null,
): AttendanceRow[] {
  const others = rows.filter((r) => !(r.event_id === eventId && r.user_id === userId))
  return previous === null ? others : [previous, ...others]
}

export type HomeCta = 'checkin' | 'going' | 'queued' | 'requested' | 'join'

/**
 * Què posa l'Inici sota el hero segons la meva resposta.
 *
 * Qui és a la llista d'espera o té la sol·licitud pendent ja ha fet el que
 * podia fer: el botó d'apuntar-s'hi tornava a aparèixer i invitava a tornar-ho
 * a demanar, que és exactament el que l'estat optimista havia de evitar. Aquí
 * hi va una línia que diu on és, no un botó.
 */
export function homeCta(mine: AttendanceState | null, canCheckIn: boolean): HomeCta {
  if (mine === 'espera') return 'queued'
  if (mine === 'sollicitat') return 'requested'
  if (canCheckIn && (mine === 'si' || mine === 'potser')) return 'checkin'
  if (mine === 'si' || mine === 'asistio') return 'going'
  return 'join'
}

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
 * El nom i la cara es conserven quan la fila ja hi era; en una de nova queden
 * a `null`, que és el que ja tolera el tipus, i la recàrrega els hi posa.
 */
export function withMyAnswer(
  rows: readonly AttendanceRow[],
  eventId: string,
  userId: string,
  estado: AttendanceState,
  now: Date,
): AttendanceRow[] {
  const has = rows.some((r) => r.event_id === eventId && r.user_id === userId)
  if (has) {
    return rows.map((r) => (r.event_id === eventId && r.user_id === userId ? { ...r, estado } : r))
  }
  return [
    { user_id: userId, event_id: eventId, estado, created_at: now.toISOString(), profiles: null },
    ...rows,
  ]
}

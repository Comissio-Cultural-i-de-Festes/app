import type { AttendanceState } from '@/lib/model'

import { type EventSummary, FACES, type Face, isGoing, summaryOf } from './summary'

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
 * El resum d'un esdeveniment amb la meva resposta nova, abans que el servidor
 * la confirmi.
 *
 * Fa el que farà el servidor amb el que la pantalla ja sap: el recompte puja o
 * baixa si entro o surto de «hi van», i la meva cara va al lloc que li
 * tocarà, que és el de quan vaig contestar el primer cop —un «potser» de fa
 * una setmana que passa a «sí» no salta al davant—, o el davant si no havia
 * contestat mai. `avatar` és la foto del meu perfil, que l'app ja té: sense,
 * la cara sortia com l'avatar per defecte fins a la recàrrega.
 *
 * Els noms d'«avui» no es toquen: el meu no hi és mai.
 */
export function withMyAnswer(
  summaries: readonly EventSummary[],
  eventId: string,
  userId: string,
  estado: AttendanceState,
  now: Date,
  avatar: string | null,
): EventSummary[] {
  const before = summaryOf(summaries, eventId)
  const was = isGoing(before.mine)
  const is = isGoing(estado)
  const at = before.mine_at ?? now.toISOString()

  const others = before.faces.filter((f) => f.user_id !== userId)
  const mineFace = before.faces.find((f) => f.user_id === userId)
  const faces =
    is && !(was && mineFace === undefined)
      ? placeFace(others, before.going - (was ? 1 : 0), {
          user_id: userId,
          avatar_url: mineFace?.avatar_url ?? avatar,
          created_at: at,
        })
      : others

  const after: EventSummary = {
    ...before,
    going: before.going - (was ? 1 : 0) + (is ? 1 : 0),
    attended:
      before.attended - (before.mine === 'asistio' ? 1 : 0) + (estado === 'asistio' ? 1 : 0),
    mine: estado,
    mine_at: at,
    faces,
  }
  return summaries.some((s) => s.event_id === eventId)
    ? summaries.map((s) => (s.event_id === eventId ? after : s))
    : [...summaries, after]
}

/**
 * La meva cara entre les dels altres, en l'ordre del servidor: la més nova
 * primer i, a igual hora, per id.
 *
 * Darrere de l'última només si no hi ha ningú més que no se sap on va: amb
 * més gent que cares, la que ve després de l'última podria ser més nova que
 * jo, i posar-m'hi seria inventar-me l'ordre.
 */
function placeFace(others: readonly Face[], othersGoing: number, mine: Face): Face[] {
  const later = (a: Face, b: Face) => {
    const d = Date.parse(b.created_at) - Date.parse(a.created_at)
    return d !== 0 ? d < 0 : a.user_id < b.user_id
  }
  const index = others.findIndex((f) => later(mine, f))
  if (index === -1 && othersGoing > others.length) return [...others]
  const at = index === -1 ? others.length : index
  return [...others.slice(0, at), mine, ...others.slice(at)].slice(0, FACES)
}

/**
 * Torna un esdeveniment a com era, sense tocar la resta.
 *
 * No es restaura la llista sencera: una altra resposta en vol, d'un altre
 * esdeveniment, ha escrit a la mateixa consulta i una instantània vella la
 * trepitjaria. `previous` és el resum d'abans, o `undefined` si la consulta
 * encara no en tenia.
 */
export function restoreEvent(
  summaries: readonly EventSummary[],
  eventId: string,
  previous: EventSummary | undefined,
): EventSummary[] {
  const others = summaries.filter((s) => s.event_id !== eventId)
  if (previous === undefined) return others
  return others.length === summaries.length
    ? [...summaries, previous]
    : summaries.map((s) => (s.event_id === eventId ? previous : s))
}

/** Les assistències: ja són aquí, encara poden arribar, o no arribaran sense que passi alguna cosa. */
export type AnswersState = 'known' | 'waiting' | 'unavailable'

export type HomeCta = 'waiting' | 'unknown' | 'checkin' | 'going' | 'queued' | 'requested' | 'join'

/**
 * Què posa l'Inici sota el hero segons la meva resposta.
 *
 * Qui és a la llista d'espera o té la sol·licitud pendent ja ha fet el que
 * podia fer: el botó d'apuntar-s'hi tornava a aparèixer i invitava a tornar-ho
 * a demanar, que és exactament el que l'estat optimista havia de evitar. Aquí
 * hi va una línia que diu on és, no un botó.
 *
 * MENTRE LES ASSISTÈNCIES NO HAN ARRIBAT, ESPERA. Sense elles `mine` és `null`
 * per a tothom, i qui ja hi anava veia «M'hi apunto» uns segons i després un
 * altre botó al mateix lloc.
 *
 * I SI NO ARRIBEN, TAMPOC S'APUNTA. `set_attendance` fa un upsert: el «sí» d'una
 * persona que és a la llista d'espera, que té una sol·licitud o que ja ha
 * fitxat li trepitjaria la fila, o fallaria. Sense saber què hi ha, el
 * botó d'apuntar-s'hi és una pregunta que no es pot fer; surt una línia que ho
 * diu i un «torna-ho a provar».
 */
export function homeCta(
  mine: AttendanceState | null,
  canCheckIn: boolean,
  answers: AnswersState,
): HomeCta {
  if (answers === 'waiting') return 'waiting'
  if (answers === 'unavailable') return 'unknown'
  if (mine === 'espera') return 'queued'
  if (mine === 'sollicitat') return 'requested'
  if (canCheckIn && (mine === 'si' || mine === 'potser')) return 'checkin'
  if (mine === 'si' || mine === 'asistio') return 'going'
  return 'join'
}

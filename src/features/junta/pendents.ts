import { looksLikePhone } from '@/features/onboarding/api'

import { llegeixAvis, llegeixMesura } from './avis'

/**
 * Un avís pendent: què val abans d'enviar-lo, i en quin estat és.
 *
 * FORA DELS COMPONENTS, com `avis.ts`, perquè es provi sense muntar res i
 * perquè el formulari i la llista han de dir el mateix.
 *
 * EL QUE ÉS D'AVÍS ES DELEGA A `llegeixAvis`: el tipus, els punts i la nota
 * tenen exactament les mateixes regles que un avís a un soci, i escriure-les
 * dues vegades és el que la 77 va haver de desfer a la base. Aquí només hi ha
 * el que és del pendent: el nom, el telèfon i el dia.
 *
 * EL TELÈFON ES VALIDA AMB `looksLikePhone`, la mateixa regla de l'onboarding:
 * si el soci no podria escriure'l al seu perfil, un pendent amb aquell número no
 * trobaria mai ningú.
 *
 * I UN CAMP EN BLANC TORNA `null`, no un problema, com a `llegeixAvis`: qui no
 * ha escrit res no s'ha equivocat de res, i és la pantalla qui apaga el botó.
 */

export const MAX_NOM = 80

export interface CampsPendent {
  readonly nom: string
  readonly telefon: string
  /** `YYYY-MM-DD`, el que dona un `<input type="date">`. */
  readonly dia: string
  readonly tipus: string
  readonly punts: string
  readonly nota: string
  readonly mesura: string
}

export type ProblemaPendent = 'nom' | 'telefon' | 'dia' | 'tipus' | 'punts' | 'nota' | 'mesura'

export interface PendentValid {
  readonly nom: string
  readonly telefon: string
  readonly dia: string
  readonly tipus: string
  readonly punts: number
  readonly nota: string
  readonly mesura: string | null
}

/**
 * El que s'enviarà, o quin camp encara no hi és.
 *
 * `avui` ÉS UN PARÀMETRE i no un `new Date()` d'aquí dins: el dia d'avui depèn
 * de la zona de l'associació, que és de `src/config`, i una funció que el
 * llegeix sola és una prova que passa o falla segons l'hora en què es corre.
 * Les dates `YYYY-MM-DD` es comparen com a cadenes, que és el mateix que
 * comparar-les com a dies.
 */
export function llegeixPendent(
  camps: CampsPendent,
  avui: string,
): PendentValid | ProblemaPendent | null {
  const nom = camps.nom.trim()
  const telefon = camps.telefon.trim()
  const dia = camps.dia.trim()

  if (nom === '') return null
  if (nom.length > MAX_NOM) return 'nom'
  if (telefon === '') return null
  if (!looksLikePhone(telefon)) return 'telefon'
  if (dia === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > avui) return 'dia'

  const avis = llegeixAvis({ tipus: camps.tipus, punts: camps.punts, nota: camps.nota })
  if (avis === null || typeof avis === 'string') return avis

  const mesura = llegeixMesura(camps.mesura)
  if (mesura === 'massa') return 'mesura'

  return { nom, telefon, dia, ...avis, mesura: mesura.mesura }
}

export function pendentValid(lectura: ReturnType<typeof llegeixPendent>): lectura is PendentValid {
  return lectura !== null && typeof lectura !== 'string'
}

export type EstatPendent = 'sense_enllacar' | 'ambigu' | 'bloquejat' | 'enllacat' | 'retirat'

/**
 * En quin estat és un pendent, a partir de les seves columnes.
 *
 * RESOLT MANA SOBRE EL MOTIU: un pendent que es va marcar ambigu i després la
 * junta el va enllaçar a mà està enllaçat, encara que la fila conservés el
 * motiu vell —la base el neteja en enllaçar-lo, però la regla ha de valer
 * igualment si algun dia no ho fes—.
 *
 * `bloquejat` és qualsevol motiu que no sigui l'ambigüitat: el sostre del curs,
 * la finestra o un error. Tots tres volen dir el mateix per a la junta —s'ha
 * provat i no ha pogut— i el motiu concret es pinta a sota.
 */
export function estatDelPendent(row: {
  readonly enllacat_at: string | null
  readonly retirat_at: string | null
  readonly motiu: string | null
}): EstatPendent {
  if (row.retirat_at !== null) return 'retirat'
  if (row.enllacat_at !== null) return 'enllacat'
  if (row.motiu === 'ambigu') return 'ambigu'
  if (row.motiu !== null) return 'bloquejat'
  return 'sense_enllacar'
}

/** Els que demanen que algú hi faci alguna cosa: el número del rebedor. */
export function demanenFeina(estat: EstatPendent): boolean {
  return estat === 'ambigu' || estat === 'bloquejat'
}

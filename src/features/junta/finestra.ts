import type { EventRow } from '@/lib/schema'

/**
 * Les hores de la porta, en un fitxer que no carrega res.
 *
 * Són les de `junta_home()` (migració 89) i les fan servir tres lectors: la
 * llista de la junta, la vista de la porta quan no hi ha dades, i les eines de
 * la fitxa. Vivien a `eventsApi.ts`, que en importar-lo arrenca el client de
 * Supabase; un mòdul de lògica pura no ha de dependre d'això per llegir tres
 * números.
 *
 * Si una d'aquestes regles canvia, la funció SQL també: el client i el
 * servidor han de triar el mateix esdeveniment.
 */

export const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Vuit hores enrere: el que dura la porta d'una festa d'una nit, des que comença. */
export const JUNTA_BACK_MS = 8 * HOUR_MS

/** Trenta hores endavant: quan un esdeveniment entra a la porta. */
export const JUNTA_AHEAD_MS = 30 * HOUR_MS

/**
 * Quan surt de la porta: vuit hores després de començar o quan s'acaba, la
 * més tardana. Una festa d'una nit, vuit hores; una casa rural, tota l'estada.
 */
export function surtDeLaPorta(e: Pick<EventRow, 'starts_at' | 'ends_at'>): number {
  const starts = Date.parse(e.starts_at)
  const ends = e.ends_at === null ? Number.NEGATIVE_INFINITY : Date.parse(e.ends_at)
  return Math.max(starts + JUNTA_BACK_MS, ends)
}

/** Si `junta_home()` posaria aquest esdeveniment a la porta ara. */
export function aLaPorta(
  e: Pick<EventRow, 'starts_at' | 'ends_at' | 'published'>,
  now: number,
): boolean {
  return e.published && Date.parse(e.starts_at) <= now + JUNTA_AHEAD_MS && surtDeLaPorta(e) >= now
}

/**
 * Quant temps després de sortir de la porta es pot encara fitxar des de la fitxa.
 *
 * DECISIÓ PROVISIONAL, i només de la interfície: `check_in` no hi posa cap
 * límit. Set dies cobreixen el que passa de debò —l'endemà es fitxa qui es va
 * quedar sense, el dilluns es repassa la casa rural— i deixen fora el toc a la
 * fitxa equivocada d'una festa d'un mes enrere, que donaria punts d'assistència
 * dins d'un període del rànquing que ja s'ha tancat. Els punts a mà no tenen
 * aquest tancament: la feina es pot reconèixer quan algú se'n recorda.
 */
export const PORTA_TANCA_MS = 7 * DAY_MS

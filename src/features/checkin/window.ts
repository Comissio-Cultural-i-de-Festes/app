import { IN_PROGRESS_MS } from '@/features/home/api'

/**
 * Quan es pot fitxar.
 *
 * Aquesta regla existeix dues vegades i les dues han de dir el mateix: aquí,
 * per decidir si el botó hi és, i a `private.checkin_open_at()` de la migració
 * 36, que és la que decideix de debò. Si divergeixen, el símptoma és un botó
 * que hi és i contesta «tancat», que és pitjor que no tenir-lo.
 *
 * La de debò és la del servidor. Aquesta només estalvia ensenyar un botó que
 * no serviria.
 */

const HOUR_MS = 3_600_000

/** Una hora abans de començar ja s'hi val: la gent arriba abans. */
export const OPENS_BEFORE_MS = HOUR_MS
/** I una hora després d'acabar, per qui se'n recorda mentre plega. */
export const CLOSES_AFTER_MS = HOUR_MS

export interface Window {
  readonly opens: number
  readonly closes: number
}

export function checkinWindow(startsAt: string, endsAt: string | null): Window {
  const starts = new Date(startsAt).getTime()
  const ends = endsAt === null ? starts + IN_PROGRESS_MS : new Date(endsAt).getTime()
  return { opens: starts - OPENS_BEFORE_MS, closes: ends + CLOSES_AFTER_MS }
}

export function isOpen(w: Window, now: number): boolean {
  return now >= w.opens && now < w.closes
}

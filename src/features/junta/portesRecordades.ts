import { aLaPorta } from './finestra'
import type { DoorNow } from './homeApi'
import { PORTA_TRIADA_KEY } from './portes'

/**
 * Les portes de l'últim cop que hi va haver xarxa, desades en aquest mòbil.
 *
 * EL CAS. La junta arriba a la casa rural, obre l'app en fred i no hi ha
 * cobertura. React Query no desa res entre obertures, o sigui que el rebedor no
 * sap a quina porta és i l'escàner —que és l'única eina que funciona sense
 * xarxa, perquè cada lectura va a la cua `SCANS` abans de sortir— només s'obria
 * escrivint-ne l'adreça. Amb això, cada cop que `junta_home()` contesta es
 * desen les portes, i sense xarxa el rebedor ofereix l'escàner de les que
 * encara són dins de la finestra.
 *
 * NOMÉS EL QUE CAL PER OBRIR L'ESCÀNER: id, títol i hores. Cap número —qui ha
 * dit que sí, qui no ha pagat—, perquè un número desat ahir es llegeix com
 * d'ara i a la porta seria mentida. Les hores sí, perquè la finestra es torna a
 * mirar en llegir-les: una festa d'ahir no ha de sortir avui.
 *
 * PER PERSONA. Dues persones de la junta poden compartir mòbil, i el que es
 * desa és de qui havia entrat; la clau porta l'id.
 *
 * NO ÉS UN PERMÍS. Qui no és de la junta i en té una de desada —un mòbil
 * heretat— veu una càmera, i el servidor refusa cada lectura que envia.
 */

export interface PortaRecordada {
  readonly id: string
  readonly titulo: string | null
  readonly starts_at: string
  readonly ends_at: string | null
}

export interface Recordades {
  /** Quan es van desar, per poder-ho dir. */
  readonly desat: number
  readonly portes: readonly PortaRecordada[]
}

const PREFIX = 'comi.junta.portes.'
const key = (userId: string) => `${PREFIX}${userId}`

export function recordaPortes(
  userId: string,
  portes: readonly DoorNow[],
  now: number = Date.now(),
): void {
  const data: Recordades = {
    desat: now,
    portes: portes.map((p) => ({
      id: p.id,
      titulo: p.titulo,
      starts_at: p.starts_at,
      ends_at: p.ends_at ?? null,
    })),
  }
  try {
    localStorage.setItem(key(userId), JSON.stringify(data))
  } catch {
    // Sense on desar-ho, el mòbil es queda com abans d'això: sense camí a
    // l'escàner si obre en fred sense xarxa. No hi ha res més a fer.
  }
}

/** Les desades que encara són a la porta ara, o null si no n'hi ha cap. */
export function portesRecordades(userId: string, now: number = Date.now()): Recordades | null {
  let parsed: unknown
  try {
    const raw = localStorage.getItem(key(userId))
    if (raw === null) return null
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!esRecordades(parsed)) return null
  const portes = parsed.portes.filter((p) => aLaPorta({ ...p, published: true }, now))
  return portes.length === 0 ? null : { desat: parsed.desat, portes }
}

/**
 * Esborra les portes desades de tothom en aquest mòbil, i la tria de porta.
 *
 * En tancar la sessió. De TOTHOM i no només de qui marxa: és l'únic moment en
 * què es pot fer sense saber qui és, i el que es perd ho torna a desar la
 * propera resposta amb xarxa. El que no es pot fer és deixar al mòbil, després
 * de tancar sessió, la llista de les activitats de la junta.
 */
export function oblidaLesPortes(): void {
  try {
    const claus: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX) === true) claus.push(k)
    }
    for (const k of claus) localStorage.removeItem(k)
    localStorage.removeItem(PORTA_TRIADA_KEY)
  } catch {
    // Sense accés a l'emmagatzematge tampoc no hi pot haver res desat.
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Una data que `Date` sap pintar. `Number.isFinite` no n'hi ha prou:
 * `1e300` ho és, i `new Date(1e300)` és una data invàlida que fa petar
 * `formatTime` a la pantalla d'error, on no hi ha cap altra sortida.
 */
const dataValida = (ms: number) => Number.isFinite(ms) && !Number.isNaN(new Date(ms).getTime())

// El que hi ha a `localStorage` ho pot haver escrit una altra versió de l'app,
// o qualsevol cosa amb accés al mòbil, i res del que s'hi trobi no ha de petar
// la pantalla d'error: és la que es veu quan no hi ha res més.
function esRecordades(x: unknown): x is Recordades {
  if (typeof x !== 'object' || x === null) return false
  const r = x as { desat?: unknown; portes?: unknown }
  return (
    typeof r.desat === 'number' &&
    dataValida(r.desat) &&
    Array.isArray(r.portes) &&
    r.portes.every(esPorta)
  )
}

function esPorta(x: unknown): x is PortaRecordada {
  if (typeof x !== 'object' || x === null) return false
  const p = x as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    UUID.test(p.id) &&
    (p.titulo === null || typeof p.titulo === 'string') &&
    typeof p.starts_at === 'string' &&
    dataValida(Date.parse(p.starts_at)) &&
    (p.ends_at === null || (typeof p.ends_at === 'string' && dataValida(Date.parse(p.ends_at))))
  )
}

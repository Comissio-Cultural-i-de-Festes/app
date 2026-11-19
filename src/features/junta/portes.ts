import type { DoorNow, JuntaHomeData } from './homeApi'

/**
 * Quina porta pinta el rebedor, quan n'hi ha més d'una.
 *
 * Des de la migració 89, `junta_home()` torna a `portes` tots els esdeveniments
 * de la finestra: una casa rural tota l'estada, i dues activitats el mateix dia
 * totes dues. La junta tria a quina fa porta, i amb una sola no hi ha res a
 * triar i el rebedor és el d'abans.
 *
 * LA TRIA ES RECORDA EN AQUEST MÒBIL, i només aquí. És de qui és a la porta:
 * a la casa rural un és a l'entrada i un altre a la festa de la ciutat, i
 * cadascun vol obrir l'app i trobar la seva. Una tria compartida per tota la
 * junta faria que l'un canviés la porta de l'altre. Si l'esdeveniment triat
 * surt de la finestra, la tria deixa de comptar sola i torna la primera.
 *
 * Sense res recordat, la primera: la que va començar abans, que és la mateixa
 * que el rebedor ensenyava abans de la 89.
 */

/** `portes` si la base les porta; contra una d'abans de la 89, la porta sola. */
export function portesDe(data: JuntaHomeData): readonly DoorNow[] {
  if (data.portes !== undefined) return data.portes
  return data.porta === null ? [] : [data.porta]
}

export function portaTriada(portes: readonly DoorNow[], triada: string | null): DoorNow | null {
  return portes.find((p) => p.id === triada) ?? portes[0] ?? null
}

/** Exportada perquè tancar la sessió l'esborri (`oblidaLesPortes`). */
export const PORTA_TRIADA_KEY = 'comi.junta.porta'
const KEY = PORTA_TRIADA_KEY

// L'emmagatzematge pot no existir —finestra privada, dades esborrades— i
// llavors la porta és la primera, que és un bon lloc on caure.
export function portaRecordada(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function recordaPorta(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Sense on desar-la, la tria dura el que duri la pantalla oberta.
  }
}

import { useEffect } from 'react'

import { sweepStorage } from './storage'
import { sweepDue, sweepMarkKey } from './sweep'

/**
 * L'escombrada de l'storage, un cop al dia per persona i mòbil, en segon pla.
 *
 * Vint segons després d'obrir l'app i no en obrir-la: el primer que ha
 * d'arribar és la pantalla, i a la casa rural la xarxa es comparteix amb tota
 * la sala. Sense sessió o sense xarxa no s'intenta, i la marca es posa només
 * quan s'ha pogut preguntar: un intent que no ha sortit es torna a provar el
 * proper cop.
 *
 * LA MARCA PORTA L'UID. Cadascú escombra la seva part —la seva carpeta, o la
 * de la junta—, o sigui que si en un mòbil compartit entra una altra persona,
 * la seva escombrada encara no s'ha fet encara que la de l'altra sí.
 *
 * La marca viu a localStorage, que pot no ser-hi (navegació privada, iOS amb
 * l'emmagatzematge bloquejat). Llavors s'escombra a cada obertura, que no fa
 * cap mal.
 */

const DELAY_MS = 20_000

function readMark(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeMark(key: string, now: number): void {
  try {
    localStorage.setItem(key, String(now))
  } catch {
    // Vegeu a dalt: sense marca s'escombra a la propera obertura.
  }
}

export function useStorageSweep(userId: string | null | undefined): void {
  useEffect(() => {
    if (userId === null || userId === undefined || userId === '') return
    const key = sweepMarkKey(userId)
    if (!sweepDue(readMark(key), Date.now())) return

    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return
      void sweepStorage().then((removed) => {
        if (removed !== null) writeMark(key, Date.now())
      })
    }, DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [userId])
}

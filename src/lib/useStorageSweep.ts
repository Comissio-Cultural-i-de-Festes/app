import { useEffect } from 'react'

import { sweepStorage } from './storage'
import { sweepDue } from './sweep'

/**
 * L'escombrada de l'storage, un cop al dia per mòbil i en segon pla.
 *
 * Vint segons després d'obrir l'app i no en obrir-la: el primer que ha
 * d'arribar és la pantalla, i a la casa rural la xarxa es comparteix amb tota
 * la sala. Sense xarxa no s'intenta, i la marca es posa només quan s'ha fet:
 * un intent que no ha pogut sortir es torna a provar el proper cop.
 *
 * La marca viu a localStorage, que pot no ser-hi (navegació privada, iOS amb
 * l'emmagatzematge bloquejat). Llavors s'escombra a cada obertura, que és el
 * mateix que abans d'haver-la posat i no fa cap mal.
 */

const KEY = 'comi.sweep.at'
const DELAY_MS = 20_000

function readMark(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeMark(now: number): void {
  try {
    localStorage.setItem(KEY, String(now))
  } catch {
    // Vegeu a dalt: sense marca s'escombra a la propera obertura.
  }
}

export function useStorageSweep(): void {
  useEffect(() => {
    if (!sweepDue(readMark(), Date.now())) return

    const timer = window.setTimeout(() => {
      if (!navigator.onLine) return
      void sweepStorage().then((removed) => {
        if (removed !== null) writeMark(Date.now())
      })
    }, DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])
}

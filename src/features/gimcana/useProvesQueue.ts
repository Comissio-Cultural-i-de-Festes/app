import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { flushProves, gimcanaKeys } from './api'

/**
 * Buidar la cua de proves quan torna la xarxa.
 *
 * A DIFERÈNCIA DELS FITXATGES, aquesta viu a la pantalla i no a l'arrel de
 * l'app, i és a posta. Fitxar és prémer un botó a la porta i guardar-se el
 * mòbil; jugar una gimcana és tenir la llista de proves oberta tota la nit. La
 * pantalla on has enviat la foto és exactament la pantalla que tornaràs a
 * mirar, i posar-ho a l'arrel voldria dir obrir IndexedDB a cada càrrega de
 * l'app per una cosa que només passa cinc nits l'any.
 *
 * L'esdeveniment `online` no salta quan la connexió torna sense que el sistema
 * se n'adoni —un túnel, un portal captiu, dues-centes persones sobre una
 * antena— o sigui que al darrere hi ha una consulta lenta.
 */

const RETRY_MS = 15_000

export function useProvesQueue(): void {
  const client = useQueryClient()

  useEffect(() => {
    let alive = true

    const drain = () => {
      void flushProves().then((sent) => {
        if (!alive || sent === 0) return
        void client.invalidateQueries({ queryKey: gimcanaKeys.all() })
      })
    }

    const wentOnline = () => {
      drain()
    }
    window.addEventListener('online', wentOnline)
    const timer = window.setInterval(() => {
      if (navigator.onLine) drain()
    }, RETRY_MS)

    // I un cop en carregar: tancar l'app sense cobertura i tornar-la a obrir
    // amb xarxa no dispara cap esdeveniment.
    drain()

    return () => {
      alive = false
      window.removeEventListener('online', wentOnline)
      window.clearInterval(timer)
    }
  }, [client])
}

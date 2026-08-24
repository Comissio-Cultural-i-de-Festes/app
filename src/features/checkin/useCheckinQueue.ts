import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { flushCheckins } from './api'

/**
 * Buidar la cua de fitxatges quan torna la xarxa.
 *
 * VIU A L'ARREL I NO A CAP PANTALLA. Les altres dues cues es buiden allà on
 * es fan servir —l'escàner mentre la junta fitxa, la llista d'idees— però
 * fitxar és el cas contrari: prems el botó a la porta, et guardes el mòbil i
 * no tornes a obrir aquella pantalla mai més. Una cua que només es buida en
 * una pantalla que ningú obre és una cua que no es buida.
 *
 * L'esdeveniment `online` no salta quan la connexió torna sense que el sistema
 * se n'adoni —un túnel, un portal captiu— o sigui que al darrere hi ha una
 * consulta lenta. És barata: si no hi ha res a la cua, no surt cap petició.
 */

const RETRY_MS = 20_000

export function useCheckinQueue(): void {
  const client = useQueryClient()

  useEffect(() => {
    let alive = true

    const drain = () => {
      void flushCheckins().then((sent) => {
        // Només quan de debò ha entrat alguna cosa: refrescar-ho tot a cada
        // batec de vint segons seria una petició que ningú ha demanat.
        if (!alive || sent === 0) return
        void client.invalidateQueries()
      })
    }

    const wentOnline = () => {
      drain()
    }
    window.addEventListener('online', wentOnline)
    const timer = window.setInterval(() => {
      if (navigator.onLine) drain()
    }, RETRY_MS)

    // I un cop en carregar: el cas normal és tancar l'app sense cobertura i
    // tornar-la a obrir amb xarxa, que no dispara cap esdeveniment.
    drain()

    return () => {
      alive = false
      window.removeEventListener('online', wentOnline)
      window.clearInterval(timer)
    }
  }, [client])
}

import { useEffect, useState } from 'react'

import {
  type Availability,
  type QueryState,
  availabilityKey,
  availabilityOf,
  isWaiting,
} from './availability'
import { useOnline } from './useOnline'

/**
 * Esquelet, missatge o dades, decidit en un sol lloc.
 *
 * `availability.ts` diu quin dels tres toca; això hi posa el rellotge, que és
 * l'única peça que no pot ser pura, i el «torna-ho a provar».
 *
 * DEU SEGONS. Prou per a una barra de 4G compartida amb tota la casa —que és
 * lenta però contesta— i prou poc perquè qui ho mira no conclogui que l'app
 * s'ha penjat. El missatge no cancel·la res: si la resposta arriba després,
 * les dades substitueixen el missatge soles.
 *
 * REINTENTAR TORNA A COMPTAR. Sense això, prémer el botó amb la xarxa encara
 * penjada deixava el mateix missatge al mateix lloc i semblava que el botó no
 * fes res; ara torna l'esquelet deu segons, que és el que ha passat.
 *
 * UN RELLOTGE COMPARTIT, QUAN DUES PORTES ESPEREN EL MATEIX. El perfil el
 * miren dues portes encaixades —la del primer cop i, a dins, la de la junta— i
 * la de dins es munta just quan la de fora ha esgotat el seu termini. Amb un
 * rellotge cadascuna, entrar a /junta amb la xarxa penjada eren vint segons de
 * «Un segon…» i no deu. `clock` els fa comptar des del mateix moment.
 */

export const STALL_MS = 10_000

interface Watched extends QueryState {
  readonly error: unknown
  readonly refetch: (options?: { readonly cancelRefetch?: boolean }) => Promise<unknown>
}

export interface View {
  readonly state: Availability
  /** Encara pot arribar: esquelet. */
  readonly loading: boolean
  /** No arribarà sense que passi alguna cosa: missatge i reintentar. */
  readonly unavailable: boolean
  readonly messageKey: string
  readonly retry: () => void
}

/**
 * Cert quan `waiting` porta `ms` seguits sense canviar.
 *
 * `round` és per reiniciar el compte sense que `waiting` hagi canviat, que és
 * el que fa un reintent amb la petició encara a l'aire.
 */
const clocks = new Map<string, number>()

export function useStalled(
  waiting: boolean,
  round = 0,
  ms = STALL_MS,
  clock?: string,
): boolean {
  const episode = waiting ? round : -1
  const [seen, setSeen] = useState(episode)
  const [stalled, setStalled] = useState(false)

  // Un episodi nou comença sense haver esgotat el termini. Durant el render i
  // no en un efecte: així el primer frame de l'espera nova ja no diu «no
  // contesta».
  if (seen !== episode) {
    setSeen(episode)
    setStalled(false)
  }

  useEffect(() => {
    if (episode < 0) {
      if (clock !== undefined) clocks.delete(clock)
      return
    }
    let since = Date.now()
    if (clock !== undefined) {
      since = clocks.get(clock) ?? since
      clocks.set(clock, since)
    }
    const id = setTimeout(
      () => {
        setStalled(true)
      },
      Math.max(0, since + ms - Date.now()),
    )
    return () => {
      clearTimeout(id)
    }
  }, [episode, ms, clock])

  return waiting && stalled
}

export function useAvailability(
  watched: Watched | readonly Watched[],
  { clock }: { readonly clock?: string } = {},
): View {
  const queries: readonly Watched[] = Array.isArray(watched) ? watched : [watched]
  const [round, setRound] = useState(0)
  const stalled = useStalled(isWaiting(queries), round, STALL_MS, clock)
  const online = useOnline()
  const state = availabilityOf(queries, stalled, online)
  const error = queries.find((q) => q.status === 'error')?.error ?? null

  return {
    state,
    loading: state === 'loading',
    unavailable: state === 'offline' || state === 'stalled' || state === 'failed',
    messageKey: availabilityKey(state, error),
    retry: () => {
      if (clock !== undefined) clocks.delete(clock)
      setRound((n) => n + 1)
      // Una primera petició penjada no es pot tornar a llançar d'aquí: sense
      // dades, React Query la reaprofita en lloc de cancel·lar-la. El que sí
      // que fa és tornar a demanar la que ha fallat, i la que ja tenia dades.
      for (const q of queries) void q.refetch({ cancelRefetch: true })
    },
  }
}

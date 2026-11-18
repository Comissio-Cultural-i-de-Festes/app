import { type Session, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

/**
 * La sessió desada, abans de decidir quina porta s'ensenya.
 *
 * Amb el testimoni d'accés encara vàlid, `getSession()` el llegeix del mòbil i
 * no toca la xarxa. Caducat —una hora després d'haver obert l'app per última
 * vegada, o sigui el matí següent a la casa rural— l'ha de renovar, i
 * aquí és on la porta es quedava encallada de dues maneres:
 *
 * - SENSE XARXA, supabase-js reintenta la renovació durant uns vint-i-cinc
 *   segons i després torna `session: null` amb un error de xarxa. L'app ho
 *   llegia com «no has entrat» i ensenyava la pantalla d'entrada a qui sí que
 *   havia entrat i ara no podia fer res per tornar-hi: entrar també necessita
 *   xarxa. La sessió segueix desada, perquè un error de xarxa no l'esborra;
 *   el que calia era no dir el contrari.
 * - AMB UNA XARXA QUE NO CONTESTA, la renovació no torna mai i «Un segon…» era
 *   per sempre.
 *
 * `unreachable` és el primer cas, amb nom propi. El segon és el rellotge de
 * `useStalled`, que la pantalla porta.
 *
 * QUAN TORNA LA XARXA S'ENTRA SOL, per dos camins: l'esdeveniment `online`
 * torna a demanar la sessió, i la renovació automàtica de supabase-js, que
 * segueix intentant-ho, avisa amb `TOKEN_REFRESHED` quan se'n surt. El primer
 * pot arribar massa d'hora —la biblioteca guarda el darrer error un minut
 * per no martellejar el servidor— i el segon és el que no falla.
 */

export type BootPhase = 'waiting' | 'unreachable' | 'ready'

export interface Boot {
  readonly phase: BootPhase
  readonly session: Session | null
}

/** `null`: hi ha una sessió desada i no s'ha pogut renovar per falta de xarxa. */
async function readSession(): Promise<{ readonly session: Session | null } | null> {
  const { data, error } = await supabase.auth.getSession()
  if (data.session === null && isAuthRetryableFetchError(error)) return null
  return { session: data.session }
}

export function useBootSession(): Boot {
  const [session, setSession] = useState<Session | null>(null)
  const [phase, setPhase] = useState<BootPhase>('waiting')

  useEffect(() => {
    let live = true

    void readSession().then((read) => {
      if (!live) return
      if (read === null) {
        setPhase((now) => (now === 'ready' ? now : 'unreachable'))
        return
      }
      setSession(read.session)
      setPhase('ready')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Una sessió que arriba sempre obre la porta. Una que se'n va només
      // quan és de debò: l'INITIAL_SESSION buit d'una renovació que no ha
      // pogut sortir no és ningú tancant la sessió.
      if (next !== null || event === 'SIGNED_OUT') setPhase('ready')
    })

    return () => {
      live = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Només mentre la porta diu «sense connexió». Amb la sessió ja oberta, tornar
  // a llegir-la a cada `online` canviaria l'objecte i tornaria a disparar el
  // que en depèn, com el bescanvi de la invitació.
  useEffect(() => {
    if (phase !== 'unreachable') return
    let live = true
    const again = (): void => {
      void readSession().then((read) => {
        if (!live || read === null) return
        setSession(read.session)
        setPhase('ready')
      })
    }
    window.addEventListener('online', again)
    return () => {
      live = false
      window.removeEventListener('online', again)
    }
  }, [phase])

  return { phase, session }
}

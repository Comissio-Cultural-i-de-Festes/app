import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { invalidateAccess } from '@/lib/signedQuery'
import { supabase } from '@/lib/supabase'

import { discardInvite, pendingInvite, rememberInvite } from './pendingInvite'
import { readInviteCode } from './useInvite'

/**
 * Redeem the invitation once, as soon as there is a session to redeem it
 * against. The code travelled in the redirect URL so this works even when the
 * link is opened on a different device from the one that asked for it.
 *
 * Fora d'`App` perquè ara té prou cos per a voler-hi un test, i les tres coses
 * que el fan llarg són de cobertura dolenta, que és el supòsit de l'estrena:
 *
 * - El codi es guarda abans de la petició (`pendingInvite`). El primer cop
 *   navega i s'endú l'adreça amb el `?codi=`.
 * - Només dues respostes són definitives: una de la funció —`ok` sigui quin
 *   sigui— i el 42501 de la invitació gastada entremig. Tota la resta es torna
 *   a provar: un 502 o un 504 del proxy, un 429, `PGRST001` amb el pool ple, un
 *   `57014`. Amb molta gent alhora a la porta, això és el cas normal, i oblidar
 *   el codi per un d'aquests deixava la persona pendent per res.
 * - Es torna a provar amb esperes que creixen durant uns minuts, quan torna la
 *   xarxa (`online`) i quan la pantalla torna a ser visible —el mòbil es
 *   desbloqueja—. Una wifi que diu que hi és i no porta res no dispara mai
 *   `online`.
 * - Cada intent té un temps límit. Un que no tornava mai deixava el següent
 *   esperant per sempre.
 *
 * `invalidateAccess` sense `await`: esborrar el codi no ha de dependre que
 * acabin els refetch, que amb la xarxa en pausa no acaben. A més de les dades,
 * torna a signar les portades que van tornar `null` abans d'entrar.
 *
 * Només un `ok: true` refresca les dades: el perfil es demana alhora que el
 * bescanvi i sol arribar abans, encara dient `pendent`, i ho seguia dient fins
 * al pròxim refresc, amb el botó d'apuntar-se apagat just la primera vegada
 * que algú el volia prémer. Tot el que la RLS deixa veure i no només el
 * perfil, pel mateix motiu que `InviteCodeSheet`.
 */

/** Les esperes entre intents: uns set minuts en total. */
const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 120_000, 180_000] as const
/** Prou per a una porta lenta, poc per a una que no contestarà. */
const ATTEMPT_TIMEOUT_MS = 15_000

interface RedeemResult {
  readonly ok: boolean
}

export function useRedeemFromLink(userId: string | null): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (userId === null) return
    const code = readInviteCode() ?? pendingInvite()
    if (code === null) return

    rememberInvite(code)

    let settled = false
    let inFlight = false
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const attempt = async () => {
      if (settled || inFlight) return
      inFlight = true
      clearTimeout(timer)
      const abort = new AbortController()
      const limit = setTimeout(() => {
        abort.abort()
      }, ATTEMPT_TIMEOUT_MS)
      const { data, error } = await supabase
        .rpc('redeem_invite', { p_codi: code })
        .abortSignal(abort.signal)
      clearTimeout(limit)
      inFlight = false
      if (settled) return

      if (data === null && error?.code !== '42501') {
        const wait = BACKOFF_MS[tries]
        tries += 1
        if (wait !== undefined) {
          timer = setTimeout(() => void attempt(), wait)
        }
        return
      }

      settled = true
      // The code is only rubbed out once it has been answered. Removing it
      // either way left somebody pending, with the one string that could have
      // got them in already gone.
      discardInvite()
      if ((data as RedeemResult | null)?.ok === true) void invalidateAccess(queryClient)
    }

    const again = () => {
      if (document.visibilityState === 'hidden') return
      void attempt()
    }

    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    void attempt()

    return () => {
      // Desmuntar no és rendir-se: el codi es queda guardat i el muntatge
      // següent ho torna a provar. `redeem_invite` és idempotent per a qui ja
      // és actiu, o sigui que un intent de més no costa res.
      settled = true
      clearTimeout(timer)
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [userId, queryClient])
}

import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { invalidateData } from '@/lib/signedQuery'
import { rpc } from '@/lib/supabase'

import { forgetInvite, pendingInvite, rememberInvite } from './pendingInvite'
import { INVITE_PARAM, readInviteCode } from './useInvite'

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
 * - Un bescanvi que no arriba es torna a provar quan torna la xarxa (`online`)
 *   i, a més, un parell de cops pel seu compte: una wifi que diu que hi és i no
 *   porta res no dispara mai `online`.
 * - Una resposta de la base —el codi no val, o s'ha gastat entremig— és
 *   definitiva. Tornar-hi no la canviarà, i el codi s'oblida.
 *
 * Només un `ok: true` refresca les dades: el perfil es demana alhora que el
 * bescanvi i sol arribar abans, encara dient `pendent`, i ho seguia dient fins
 * al pròxim refresc, amb el botó d'apuntar-se apagat just la primera vegada
 * que algú el volia prémer. Tot el que la RLS deixa veure i no només el
 * perfil, pel mateix motiu que `InviteCodeSheet`.
 */

/** Els intents sols, a part dels que porta l'esdeveniment `online`. */
const TRIES = 3
const RETRY_MS = 10_000

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

    const finish = () => {
      settled = true
      forgetInvite()
      // The code is only rubbed out of the address bar once it has been
      // answered. Removing it either way left somebody pending, with the one
      // string that could have got them in already gone.
      const url = new URL(window.location.href)
      if (!url.searchParams.has(INVITE_PARAM)) return
      url.searchParams.delete(INVITE_PARAM)
      window.history.replaceState(window.history.state, '', url.toString())
    }

    const attempt = async () => {
      if (settled || inFlight) return
      inFlight = true
      const { data, error } = await rpc<RedeemResult>('redeem_invite', { p_codi: code })
      inFlight = false
      if (settled) return

      // Sense codi SQL vol dir que la petició no ha arribat, o no ha tornat.
      if (error !== null && error.code === '') {
        tries += 1
        if (tries < TRIES) timer = setTimeout(() => void attempt(), RETRY_MS)
        return
      }

      finish()
      if (data?.ok === true) void invalidateData(queryClient)
    }

    const onOnline = () => {
      clearTimeout(timer)
      void attempt()
    }

    window.addEventListener('online', onOnline)
    void attempt()

    return () => {
      // Desmuntar no és rendir-se: el codi es queda guardat i el muntatge
      // següent ho torna a provar. `redeem_invite` és idempotent per a qui ja
      // és actiu, o sigui que un intent de més no costa res.
      settled = true
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [userId, queryClient])
}

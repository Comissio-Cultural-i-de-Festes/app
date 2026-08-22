import { useEffect, useState } from 'react'

import { rpc } from '@/lib/supabase'

/**
 * The invitation the person arrived with.
 *
 * The junta pastes a link into the WhatsApp group, so the code travels in the
 * query string. Whoever is in the group has the link; whoever is not, does
 * not. That is the whole gate, and it is a faithful translation of the real
 * membership rule — the email domain would let in all 3,500 students on the
 * campus.
 */

export const INVITE_PARAM = 'codi'

export type InviteState =
  | { status: 'checking' }
  /** No code in the URL, or one the server rejected. Both land here on
   *  purpose: the server answers identically for a code that never existed,
   *  one that was revoked and one that is used up, so a code cannot be probed
   *  for having once been real. */
  | { status: 'none' }
  | { status: 'valid'; code: string; expiresAt: Date | null }

interface PreviewResult {
  valid: boolean
  expires_at?: string | null
}

export function readInviteCode(search = window.location.search): string | null {
  const code = new URLSearchParams(search).get(INVITE_PARAM)
  return code && code.trim() !== '' ? code.trim() : null
}

export function useInvite(): InviteState {
  // No code in the URL is knowable at first render, so it is the initial state
  // rather than something an effect discovers a frame later.
  const [state, setState] = useState<InviteState>(() =>
    readInviteCode() === null ? { status: 'none' } : { status: 'checking' },
  )

  useEffect(() => {
    const code = readInviteCode()
    if (code === null) return

    let cancelled = false
    void (async () => {
      const { data, error } = await rpc<PreviewResult>('invite_preview', { p_codi: code })
      if (cancelled) return

      if (error || !data?.valid) {
        setState({ status: 'none' })
        return
      }

      setState({
        status: 'valid',
        code,
        expiresAt: data.expires_at ? new Date(data.expires_at) : null,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

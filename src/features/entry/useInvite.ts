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
  /** No code in the URL at all. */
  | { status: 'none' }
  /** There was a code and the server would not take it.
   *
   *  Which of the four reasons —never existed, revoked, used up, expired— is
   *  not knowable, and that is deliberate: `invite_preview` answers
   *  identically to all four so a code cannot be probed for having once been
   *  real. But *that* it failed is knowable right here, from the URL, and
   *  saying so leaks nothing the screen does not already leak by showing the
   *  invited variant when a code is good. Collapsing this into `none` was the
   *  bug: somebody arriving with last week's WhatsApp link got the "ask for
   *  access" screen with no hint that the link they used had failed. */
  | { status: 'invalid' }
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
        setState({ status: 'invalid' })
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

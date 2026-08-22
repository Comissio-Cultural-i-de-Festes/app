import { isStandalone } from '@/lib/platform'
import { supabase } from '@/lib/supabase'

import { INVITE_PARAM } from './useInvite'

/**
 * Sign in with Google, and the one thing that could go wrong on iOS.
 *
 * The magic link stranded people because the link was opened from Mail — a
 * different app, with no way to hand back to a home-screen icon, so the
 * session landed in Safari's storage and the installed app stayed signed out.
 *
 * OAuth is a different shape. The app itself navigates away and the provider
 * redirects back to our own origin, which is inside the manifest scope, and
 * iOS returns an in-scope navigation to the installed app rather than leaving
 * it in the browser sheet. The PKCE verifier stays in the context that started
 * the trip, which is the same one that receives the code.
 *
 * That is the theory, and it holds on every iOS since 12.2 as far as the
 * documentation goes. It has not been proved on a real handset here, so the
 * marker below exists: if we come back to an installed app with no session,
 * that is the trip having ended somewhere else, and it is worth saying so out
 * loud rather than showing a screen that looks like nothing happened.
 */

const STARTED_KEY = 'comi.oauth.startedAt'
/** Long enough for somebody to actually type a Google password. */
const STRANDED_AFTER_MS = 15 * 60 * 1000

function mark(now = Date.now()): void {
  try {
    localStorage.setItem(STARTED_KEY, String(now))
  } catch {
    // Storage blocked. We lose the detection, not the sign-in.
  }
}

function readMark(): number {
  try {
    return Number(localStorage.getItem(STARTED_KEY) ?? 0)
  } catch {
    return 0
  }
}

export function clearOAuthMark(): void {
  try {
    localStorage.removeItem(STARTED_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * True when the round trip was started here and never came back with a
 * session. Only meaningful in an installed app: in a browser tab a person who
 * simply gave up looks identical, and telling them something went wrong would
 * be a lie.
 */
export function looksStranded(now = Date.now()): boolean {
  if (!isStandalone()) return false
  const startedAt = readMark()
  if (!Number.isFinite(startedAt) || startedAt === 0) return false
  return now - startedAt < STRANDED_AFTER_MS
}

export interface GoogleSignInResult {
  error: string | null
}

export async function signInWithGoogle(inviteCode: string | null): Promise<GoogleSignInResult> {
  // Carry the code through so it can be redeemed once there is a session,
  // exactly as the email path did.
  const redirect = new URL(window.location.origin)
  if (inviteCode !== null) redirect.searchParams.set(INVITE_PARAM, inviteCode)

  mark()

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirect.toString(),
      // No skipBrowserRedirect and no popup, deliberately. supabase-js does a
      // same-tab window.location.assign, and a popup would never open in a
      // standalone iOS app anyway.
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error) {
    clearOAuthMark()
    return { error: error.message }
  }
  return { error: null }
}

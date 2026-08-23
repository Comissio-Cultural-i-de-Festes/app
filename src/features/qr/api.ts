import { rpc } from '@/lib/supabase'

/**
 * The check-in credential, and the one thing in this app that has to work with
 * no signal at all.
 *
 * A queue at a door in a basement, a farmhouse in the Pyrenees, a hundred
 * phones on one cell: the specification is explicit that the member's phone
 * must not need a connection, and that one device — the scanner — carries that
 * burden for everybody. So the token is fetched once and kept.
 *
 * Kept in localStorage rather than in the query cache: React Query's cache
 * lives in memory and dies with the tab, and the person opening the app at the
 * door has just been handed their phone back from a coat pocket.
 *
 * It is a bearer credential, so two rules follow. It is stored under the
 * member's own id, because an installed PWA is one browser profile that two
 * people can share; and it is wiped on sign-out, which is the one moment a
 * device stops being yours.
 */

const KEY_PREFIX = 'comi.qr.'

export const qrKeys = {
  mine: (userId: string) => ['qr', userId] as const,
}

function cacheKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function readCachedToken(userId: string): string | null {
  try {
    return localStorage.getItem(cacheKey(userId))
  } catch {
    // Private mode, or storage blocked. Not a reason to fail — it just means
    // the QR needs a connection this time.
    return null
  }
}

function writeCachedToken(userId: string, token: string): void {
  try {
    localStorage.setItem(cacheKey(userId), token)
  } catch {
    /* nothing to do: the screen still works, it just will not work offline */
  }
}

/** Called on sign-out. A shared phone must not keep somebody else's door pass. */
export function forgetCachedTokens(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(KEY_PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    /* nothing to do */
  }
}

/**
 * The token, from the server when there is one and from the pocket when there
 * is not.
 *
 * Never throws when a cached token exists: at the door, a stale-but-valid
 * token is worth infinitely more than a correct error message. Tokens only
 * change when somebody rotates one deliberately.
 */
export async function fetchQrToken(userId: string): Promise<string> {
  const cached = readCachedToken(userId)

  const { data, error } = await rpc<string>('my_qr')
  if (error !== null || data === null) {
    if (cached !== null) return cached
    throw error ?? new Error('no token')
  }

  writeCachedToken(userId, data)
  return data
}

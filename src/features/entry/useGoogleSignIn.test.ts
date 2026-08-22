import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearOAuthMark, looksStranded, signInWithGoogle } from './useGoogleSignIn'

let mockStandalone = false
const signInWithOAuth = vi.fn()

vi.mock('@/lib/platform', () => ({
  isIos: () => true,
  isStandalone: () => mockStandalone,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args) as unknown,
    },
  },
}))

const NOW = new Date('2026-09-01T20:00:00Z').getTime()

beforeEach(() => {
  mockStandalone = false
  localStorage.clear()
  signInWithOAuth.mockReset()
  signInWithOAuth.mockResolvedValue({ error: null })
})

afterEach(() => {
  clearOAuthMark()
})

describe('signing in with Google', () => {
  it('redirects in the same tab, never a popup', async () => {
    // A popup will not open in a standalone iOS app at all, and supabase-js
    // does a window.location.assign unless told otherwise. Asking for either
    // skipBrowserRedirect or a popup would break the one context this whole
    // design is built around.
    await signInWithGoogle(null)

    const options = signInWithOAuth.mock.calls[0]?.[0] as { options?: Record<string, unknown> }
    expect(options.options).not.toHaveProperty('skipBrowserRedirect')
  })

  it('carries the invitation code through the round trip', async () => {
    // Google says who you are. The code is what admits you, and it has to
    // survive a trip through two other origins to be redeemable on the way
    // back — including when the link was opened on a different device.
    await signInWithGoogle('ALFA-7F3K')

    const call = signInWithOAuth.mock.calls[0]?.[0] as {
      provider: string
      options: { redirectTo: string }
    }
    expect(call.provider).toBe('google')
    const redirect = new URL(call.options.redirectTo)
    expect(redirect.origin).toBe(window.location.origin)
    expect(redirect.searchParams.get('codi')).toBe('ALFA-7F3K')
  })

  it('sends nothing extra when there is no code', async () => {
    await signInWithGoogle(null)
    const call = signInWithOAuth.mock.calls[0]?.[0] as { options: { redirectTo: string } }
    expect(new URL(call.options.redirectTo).searchParams.has('codi')).toBe(false)
  })

  it('redirects back inside the manifest scope, which is what returns to the app', async () => {
    // The manifest scope is "/", so any URL on our own origin is in scope. An
    // out-of-scope landing would leave the person in the in-app browser with
    // the session in the wrong storage.
    await signInWithGoogle(null)
    const call = signInWithOAuth.mock.calls[0]?.[0] as { options: { redirectTo: string } }
    expect(new URL(call.options.redirectTo).pathname).toBe('/')
  })
})

describe('spotting a round trip that did not come back', () => {
  it('says nothing in a browser tab, where giving up looks identical', async () => {
    mockStandalone = false
    await signInWithGoogle(null)
    expect(looksStranded(NOW + 1000)).toBe(false)
  })

  it('flags it in an installed app that came back with no session', async () => {
    mockStandalone = true
    vi.setSystemTime(NOW)
    await signInWithGoogle(null)

    expect(looksStranded(NOW + 1000)).toBe(true)
    vi.useRealTimers()
  })

  it('says nothing if no round trip was ever started', () => {
    mockStandalone = true
    expect(looksStranded(NOW)).toBe(false)
  })

  it('stops flagging long after the fact', async () => {
    // Somebody who signed in a fortnight ago and is signed out today is not
    // stranded, they are just signed out.
    mockStandalone = true
    vi.setSystemTime(NOW)
    await signInWithGoogle(null)

    expect(looksStranded(NOW + 20 * 60 * 1000)).toBe(false)
    vi.useRealTimers()
  })

  it('is cleared once a session lands', async () => {
    mockStandalone = true
    vi.setSystemTime(NOW)
    await signInWithGoogle(null)
    clearOAuthMark()

    expect(looksStranded(NOW + 1000)).toBe(false)
    vi.useRealTimers()
  })

  it('does not leave the mark behind when the call itself failed', async () => {
    // Nothing left the device, so nothing can have been stranded.
    mockStandalone = true
    signInWithOAuth.mockResolvedValue({ error: { message: 'provider is not enabled' } })

    const { error } = await signInWithGoogle(null)

    expect(error).not.toBeNull()
    expect(looksStranded(NOW)).toBe(false)
  })
})

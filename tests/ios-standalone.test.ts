import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The two head tags that only misbehave on a real iPhone, after installing.
 *
 * Neither of these shows up in a browser, in CI, or in any emulator. They both
 * cost a physical device and a home-screen install to find, which is exactly
 * the kind of rule that belongs in a test rather than in somebody's memory.
 *
 * `viewport-fit=cover` is required or every env(safe-area-inset-*) resolves to
 * 0px and the whole safe-area layer becomes a no-op — the tab bar sits on the
 * home indicator and nobody notices until the app is on a phone.
 *
 * `black-translucent` is the opposite mistake. It asks iOS to draw the page
 * under the status bar, and installed on the home screen iOS then lays its own
 * blurred scrim over that band. On this app that scrim covered the entire
 * header and stayed pinned there while the content scrolled underneath. It
 * reads like a rendering bug in the app and it is not one.
 */

const html = readFileSync('index.html', 'utf8')

function metaContent(name: string): string | null {
  const match = new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`).exec(html)
  return match?.[1] ?? null
}

describe('the iOS standalone head', () => {
  it('asks for viewport-fit=cover, or every safe-area token is a no-op', () => {
    expect(metaContent('viewport')).toContain('viewport-fit=cover')
  })

  it('does not ask iOS to draw under the status bar', () => {
    // `default` would be a white bar with dark glyphs over a black app, so
    // `black` is the only other sensible value.
    expect(metaContent('apple-mobile-web-app-status-bar-style')).toBe('black')
  })
})

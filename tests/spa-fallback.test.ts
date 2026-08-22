import { existsSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * Deep links and refreshes have to keep working.
 *
 * Cloudflare Pages decides whether a project is a single-page application by
 * looking for a top-level 404.html. Without one it serves index.html for
 * anything that does not match an asset, which is exactly what a client-side
 * router needs. Add a 404.html and that stops, silently: the app still works
 * when you click through it, and only breaks when somebody opens /ranquing
 * directly or hits refresh.
 *
 * The other half is that the usual `_redirects` rule is not the fix. Pages
 * rejects "/*  /index.html  200" as an infinite loop and ignores it, because
 * index.html matches /* as well. Shipping it produces a build warning and no
 * behaviour.
 */

const PUBLIC_DIR = 'public'
const DIST = 'dist'

describe('the Pages SPA fallback', () => {
  it('has no 404.html, which is what enables it', () => {
    const offenders = [PUBLIC_DIR, DIST]
      .filter((dir) => existsSync(dir))
      .filter((dir) => readdirSync(dir).some((f) => f.toLowerCase() === '404.html'))

    expect(
      offenders,
      'A top-level 404.html turns off Cloudflare Pages\' SPA fallback. Deep ' +
        'links and refreshes will 404 while clicking around still works, so ' +
        'it will be reported as "the router is broken" weeks later.\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  it('ships no _redirects file, because the SPA rule there is a no-op', () => {
    expect(
      existsSync(`${PUBLIC_DIR}/_redirects`),
      'Pages ignores "/*  /index.html  200" as an infinite loop and warns ' +
        'about it at build time. The fallback is already on; see public/_headers.',
    ).toBe(false)
  })
})

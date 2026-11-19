import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * La primera petició a Supabase paga DNS, TCP i TLS. Si no s'ha obert la
 * connexió abans, ho paga quan el JS ja ha acabat de baixar-se i d'executar-se.
 */

const html = readFileSync('index.html', 'utf8')
const config = readFileSync('vite.config.ts', 'utf8')

describe('la connexió a Supabase oberta abans que faci falta', () => {
  it('té un preconnect amb crossorigin: les peticions de supabase-js són CORS', () => {
    const tag = /<link\s+rel="preconnect"\s+href="%SUPABASE_ORIGIN%"([^>]*)>/.exec(html)
    expect(tag).not.toBeNull()
    expect(tag?.[1]).toMatch(/\bcrossorigin\b/)
  })

  it('té un dns-prefetch al mateix origen, per als navegadors sense preconnect', () => {
    expect(html).toMatch(/<link\s+rel="dns-prefetch"\s+href="%SUPABASE_ORIGIN%"/)
  })

  it('l’origen surt de VITE_SUPABASE_URL, no escrit a l’HTML', () => {
    expect(html).not.toMatch(/rel="(?:preconnect|dns-prefetch)"\s+href="https?:/)
    expect(config).toMatch(/replaceAll\('%SUPABASE_ORIGIN%', supabaseOrigin\)/)
  })

  it('és a l’origen que la CSP ja deixa connectar', () => {
    const headers = readFileSync('public/_headers', 'utf8')
    expect(headers).toMatch(/connect-src 'self' https:\/\/[a-z0-9.-]+\.supabase\.co/)
  })
})

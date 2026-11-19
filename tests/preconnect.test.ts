import { readFileSync } from 'node:fs'

import { loadEnv } from 'vite'
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

  it('el que es preconnecta és exactament un origen que la CSP deixa connectar', () => {
    const headers = readFileSync('public/_headers', 'utf8')
    const connect = /connect-src ([^\r\n]*)/.exec(headers)?.[1] ?? ''
    const allowed = connect.split(/\s+/).filter((source) => source.startsWith('https://'))

    // Un build de producció té una URL https: el seu origen, tal qual, ha de
    // ser a la llista. Un de local (http://127.0.0.1) no té res a comparar.
    const url = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL ?? ''
    if (url.startsWith('https://')) expect(allowed).toContain(new URL(url).origin)

    // I el que hi ha escrit a la CSP és un origen, no una ruta ni un comodí.
    const hosts = allowed.filter((source) => source.endsWith('.supabase.co'))
    expect(hosts).toHaveLength(1)
    for (const host of hosts) expect(new URL(host).origin).toBe(host)
  })
})

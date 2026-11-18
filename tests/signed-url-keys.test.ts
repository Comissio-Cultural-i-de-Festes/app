import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * Cap URL signada no viu fora d'una clau `signedKey`.
 *
 * La regla que impedeix tornar a signar cada imatge en tornar a l'app és una
 * marca a la clau (`lib/signedQuery.ts`): la invalidació se la salta i els
 * temps hi van lligats. Una pantalla nova que signi amb una clau qualsevol se'n
 * quedaria fora sense que cap test de comportament ho veiés —la imatge es veu
 * igual, només que es baixa vint vegades al dia—, i la factura arriba un mes
 * més tard en forma d'API caiguda per quota.
 *
 * Tres comprovacions de text, que és tot el que se'n pot dir sense executar
 * cada pantalla:
 *
 *   - només `lib/storage.ts` parla amb `createSignedUrl(s)`;
 *   - qualsevol altre fitxer que cridi `signedUrls(`/`signedUrl(` construeix
 *     també la seva clau amb `signedKey(` (avui, només l'avatar, que agrupa les
 *     peticions a mà; la resta passa per `signedUrlsQuery`);
 *   - ningú no crida `invalidateQueries()` sense filtre: és exactament el que
 *     ho tornava a signar tot. Per a «refresca-ho tot» hi ha `invalidateData`.
 */

const SOURCES = globSync('src/**/*.{ts,tsx}').filter((f) => !f.includes('.test.'))

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'))
}

const normalised = (file: string) => file.replaceAll('\\', '/')
const STORAGE = 'src/lib/storage.ts'

describe('les URL signades', () => {
  it('troba fitxers per mirar, perquè una passada buida no vol dir res', () => {
    expect(SOURCES.length).toBeGreaterThan(100)
    expect(SOURCES.map(normalised)).toContain(STORAGE)
  })

  it('només lib/storage.ts crida createSignedUrl(s)', () => {
    const outside = SOURCES.filter(
      (f) => normalised(f) !== STORAGE && /\bcreateSignedUrls?\(/.test(code(f)),
    ).map(normalised)
    expect(outside).toEqual([])
  })

  it('qui signa fora de lib/storage.ts posa la marca a la clau', () => {
    const unmarked = SOURCES.filter((f) => {
      if (normalised(f) === STORAGE) return false
      const source = code(f)
      return /\bsignedUrls?\(/.test(source) && !/\bsignedKey\(/.test(source)
    }).map(normalised)
    expect(
      unmarked,
      'una URL signada amb una clau qualsevol es torna a signar a cada tornada',
    ).toEqual([])
  })

  it('cap invalidateQueries() sense filtre', () => {
    const bare = SOURCES.filter((f) => /\binvalidateQueries\(\s*\)/.test(code(f))).map(normalised)
    expect(bare, 'fes servir invalidateData(client) de lib/signedQuery.ts').toEqual([])
  })
})

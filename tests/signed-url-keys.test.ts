import { globSync, readFileSync } from 'node:fs'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Res no torna a signar —i a baixar— totes les imatges de cop.
 *
 * La regla que ho evita és una marca a la clau (`lib/signedQuery.ts`): la
 * invalidació se la salta i els temps hi van lligats. L'única manera de signar
 * és `signedUrlQuery` de `lib/storage.ts`, que ja la porta, i això ho vigila el
 * compilador: `signedUrls` ja no s'exporta. El que el compilador no veu són
 * dues dreceres, i aquest fitxer les busca:
 *
 *   - cridar `createSignedUrl(s)` des d'un altre lloc, amb una clau qualsevol;
 *   - un `invalidateQueries()`, `refetchQueries()` o `resetQueries()` que ho
 *     agafi tot: sense arguments, amb `{}`, o amb `queryKey: []`. És exactament
 *     el que ho tornava a signar tot cada cop que el telèfon sortia de la
 *     butxaca. Per a «refresca-ho tot» hi ha `invalidateData`.
 *
 * Amb l'arbre sintàctic de TypeScript i no amb expressions regulars sobre el
 * text: treure comentaris amb una regex s'empassava mig fitxer a la primera
 * cadena amb `/*` a dins, com un `accept="image/*"`.
 */

const SOURCES = globSync('src/**/*.{ts,tsx}')
  .filter((f) => !f.includes('.test.'))
  .map((f) => f.replaceAll('\\', '/'))

const STORAGE = 'src/lib/storage.ts'
const SIGNING = new Set(['createSignedUrl', 'createSignedUrls'])
const SWEEPING = new Set(['invalidateQueries', 'refetchQueries', 'resetQueries'])

function calledName(call: ts.CallExpression): string | null {
  const callee = call.expression
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  if (ts.isIdentifier(callee)) return callee.text
  return null
}

/** Cap argument, `{}`, un objecte sense `queryKey` ni `predicate`, o `queryKey: []`. */
function sweepsEverything(call: ts.CallExpression): boolean {
  const [filters] = call.arguments
  if (filters === undefined) return true
  if (!ts.isObjectLiteralExpression(filters)) return false

  let narrowed = false
  for (const prop of filters.properties) {
    // `{ ...filters }` no se sap què porta: no és cosa d'aquest test.
    if (ts.isSpreadAssignment(prop)) narrowed = true
    const name = prop.name !== undefined && ts.isIdentifier(prop.name) ? prop.name.text : null
    if (name === 'predicate') narrowed = true
    if (name === 'queryKey') {
      const empty =
        ts.isPropertyAssignment(prop) &&
        ts.isArrayLiteralExpression(prop.initializer) &&
        prop.initializer.elements.length === 0
      if (!empty) narrowed = true
    }
  }
  return !narrowed
}

interface Hit {
  readonly file: string
  readonly line: number
  readonly name: string
}

function scan(file: string, source: string): { signing: Hit[]; sweeping: Hit[] } {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const signing: Hit[] = []
  const sweeping: Hit[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calledName(node)
      const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1
      if (name !== null && SIGNING.has(name)) signing.push({ file, line, name })
      if (name !== null && SWEEPING.has(name) && sweepsEverything(node)) {
        sweeping.push({ file, line, name })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { signing, sweeping }
}

const found = SOURCES.map((file) => scan(file, readFileSync(file, 'utf8')))
const show = (hits: Hit[]) => hits.map((h) => `${h.file}:${String(h.line)} ${h.name}`)

describe('el detector', () => {
  it('veu les formes de «tot», i no les que filtren', () => {
    const { sweeping } = scan(
      'x.ts',
      [
        'client.invalidateQueries()',
        'client.refetchQueries({})',
        'client.resetQueries({ queryKey: [] })',
        "client.invalidateQueries({ refetchType: 'all' })",
        "client.invalidateQueries({ queryKey: ['events'] })",
        'client.invalidateQueries({ predicate: () => true })',
      ].join('\n'),
    )
    expect(sweeping.map((h) => h.line)).toEqual([1, 2, 3, 4])
  })

  it('no es deixa enganyar per una cadena que sembla un comentari', () => {
    const { signing } = scan(
      'x.tsx',
      [
        'const a = <input accept="image/*" />',
        "supabase.storage.from('b').createSignedUrls(['p'], 60)",
      ].join('\n'),
    )
    expect(signing.map((h) => h.line)).toEqual([2])
  })

  it('troba fitxers per mirar, perquè una passada buida no vol dir res', () => {
    expect(SOURCES.length).toBeGreaterThan(100)
    expect(SOURCES).toContain(STORAGE)
    expect(found.flatMap((f) => f.signing).length).toBeGreaterThan(0)
  })
})

describe('les URL signades', () => {
  it('només lib/storage.ts crida createSignedUrl(s)', () => {
    const outside = found.flatMap((f) => f.signing).filter((h) => h.file !== STORAGE)
    expect(show(outside)).toEqual([])
  })

  it('cap invalidació, refetch ni reset sense filtre', () => {
    const bare = found.flatMap((f) => f.sweeping)
    expect(show(bare), 'fes servir invalidateData(client) de lib/signedQuery.ts').toEqual([])
  })
})

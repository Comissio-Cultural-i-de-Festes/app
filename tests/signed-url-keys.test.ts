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
 *   - un `invalidateQueries()`, `refetchQueries()`, `resetQueries()` o
 *     `removeQueries()` que ho agafi tot: sense arguments, amb `undefined`,
 *     amb `{}`, o amb `queryKey: []` (amb `as const` o sense); o un `clear()`
 *     de la memòria cau. És exactament el que ho tornava a signar tot cada cop
 *     que el telèfon sortia de la butxaca. Per a «refresca-ho tot» hi ha
 *     `invalidateData`. L'única excepció és `lib/forgetSession.ts`, que buida
 *     la cau en tancar sessió: allà les URL de qui marxa no han de quedar-se
 *     per a qui entri;
 *   - una d'aquestes crides amb una clau que comença per `'signed'` des de
 *     fora de `src/lib/`: refrescar a mà una firma és tornar a baixar la
 *     imatge, i el lloc on es decideix és `useSignedUrls`.
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
const FORGETTING = 'src/lib/forgetSession.ts'
const FILTERED = new Set(['invalidateQueries', 'refetchQueries', 'resetQueries', 'removeQueries'])

/** `x as const`, `(x)`, `x satisfies T`: el valor que hi ha a sota. */
function unwrap(node: ts.Expression): ts.Expression {
  let current = node
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression
  }
  return current
}

/** `clear()` sense arguments sobre alguna cosa que es diu client o cau. */
function clearsCache(call: ts.CallExpression): boolean {
  const callee = call.expression
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== 'clear') return false
  if (call.arguments.length > 0) return false
  return /client|cache/i.test(callee.expression.getText())
}

/** Si el filtre és un objecte amb `queryKey`, el valor d'aquesta clau. */
function keyOf(call: ts.CallExpression): ts.Expression | null {
  const [filters] = call.arguments
  if (filters === undefined) return null
  const object = unwrap(filters)
  if (!ts.isObjectLiteralExpression(object)) return null
  for (const prop of object.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'queryKey'
    ) {
      return unwrap(prop.initializer)
    }
  }
  return null
}

/** Una clau que comença per `'signed'`, o que la fabrica `signedKey(…)`. */
function targetsSigned(call: ts.CallExpression): boolean {
  const key = keyOf(call)
  if (key === null) return false
  if (ts.isCallExpression(key)) return calledName(key) === 'signedKey'
  if (!ts.isArrayLiteralExpression(key)) return false
  const [first] = key.elements
  if (first === undefined) return false
  if (ts.isStringLiteral(first)) return first.text === 'signed'
  return ts.isIdentifier(first) && first.text === 'SIGNED'
}

function calledName(call: ts.CallExpression): string | null {
  const callee = call.expression
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text
  if (ts.isIdentifier(callee)) return callee.text
  return null
}

/** Cap argument, `{}`, un objecte sense `queryKey` ni `predicate`, o `queryKey: []`. */
function sweepsEverything(call: ts.CallExpression): boolean {
  const [first] = call.arguments
  if (first === undefined) return true
  const filters = unwrap(first)
  if (ts.isIdentifier(filters) && filters.text === 'undefined') return true
  if (!ts.isObjectLiteralExpression(filters)) return false

  let narrowed = false
  for (const prop of filters.properties) {
    // `{ ...filters }` no se sap què porta: no és cosa d'aquest test.
    if (ts.isSpreadAssignment(prop)) narrowed = true
    const name = prop.name !== undefined && ts.isIdentifier(prop.name) ? prop.name.text : null
    if (name === 'predicate') narrowed = true
    if (name === 'queryKey') {
      const value = ts.isPropertyAssignment(prop) ? unwrap(prop.initializer) : null
      const empty =
        value !== null && ts.isArrayLiteralExpression(value) && value.elements.length === 0
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

function scan(file: string, source: string): { signing: Hit[]; sweeping: Hit[]; forcing: Hit[] } {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const signing: Hit[] = []
  const sweeping: Hit[] = []
  const forcing: Hit[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calledName(node)
      const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1
      if (name !== null && SIGNING.has(name)) signing.push({ file, line, name })
      if (name !== null && FILTERED.has(name)) {
        if (sweepsEverything(node)) sweeping.push({ file, line, name })
        else if (targetsSigned(node)) forcing.push({ file, line, name })
      }
      if (clearsCache(node) && file !== FORGETTING) sweeping.push({ file, line, name: 'clear' })
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { signing, sweeping, forcing }
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
        'client.removeQueries()',
        'client.invalidateQueries(undefined)',
        'client.refetchQueries({ queryKey: [] as const })',
        'queryClient.clear()',
        'cache.clear()',
        'seen.clear()',
        'client.clear(1)',
        "client.invalidateQueries({ refetchType: 'all' })",
        "client.invalidateQueries({ queryKey: ['events'] })",
        'client.invalidateQueries({ predicate: () => true })',
      ].join('\n'),
    )
    expect(sweeping.map((h) => h.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 11])
  })

  it('veu una clau signada', () => {
    const { forcing } = scan(
      'x.ts',
      [
        "client.invalidateQueries({ queryKey: ['signed', 'avatars'] })",
        "client.refetchQueries({ queryKey: signedKey('avatars', 'a') })",
        "client.removeQueries({ queryKey: ['signed'] as const })",
        "client.invalidateQueries({ queryKey: ['events', 'signed'] })",
        'client.invalidateQueries({ predicate: revalidates })',
      ].join('\n'),
    )
    expect(forcing.map((h) => h.line)).toEqual([1, 2, 3])
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

  it('ningú fora de lib refresca una firma a mà', () => {
    const outside = found.flatMap((f) => f.forcing).filter((h) => !h.file.startsWith('src/lib/'))
    expect(show(outside)).toEqual([])
  })

  it('cap invalidació, refetch, reset, remove ni clear sense filtre', () => {
    const bare = found.flatMap((f) => f.sweeping)
    expect(show(bare), 'fes servir invalidateData(client) de lib/signedQuery.ts').toEqual([])
  })
})

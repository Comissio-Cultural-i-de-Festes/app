import { globSync, readFileSync } from 'node:fs'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Una mutació que escriu a una cua offline té `networkMode: 'always'`.
 *
 * React Query atura les mutacions quan `navigator.onLine` és fals: no falla,
 * no crida `mutationFn`, no fa res. Si el que hi ha dins és el que desa la
 * feina a IndexedDB abans de la xarxa, prémer el botó sense cobertura no deixa
 * rastre enlloc. Ja ha passat amb el check-in i amb les idees, i res no ho
 * vigilava: cada mutació nova ho havia de recordar.
 *
 * Com es troba una mutació així. Es parteix de les dues funcions de
 * `lib/queue.ts` que escriuen (`enqueue` i `put`) i es puja pels imports: una
 * funció «escriu» si les crida o si en crida una que escriu, sigui al mateix
 * fitxer o a un altre (`api.ts`). Després, per a cada `useMutation`, es mira
 * si el seu `mutationFn` crida alguna funció que escriu. Es resol cada crida
 * pel seu import i no pel nom a seques: `door/api.ts` té un `scan` i
 * `lib/storage.ts` un `enqueue` que no tenen res a veure amb la cua.
 *
 * Els límits, a propòsit: només segueix crides directes a identificadors (no
 * `api.scan()` ni funcions passades com a valor) i un `useMutation` el primer
 * argument del qual no és un objecte literal es denuncia en lloc d'ignorar-lo,
 * perquè no se sap què fa. Amb l'arbre sintàctic de TypeScript i no amb regex,
 * com `signed-url-keys.test.ts`.
 */

const QUEUE = 'src/lib/queue.ts'
const WRITERS = new Set(['enqueue', 'put'])

type Files = Readonly<Record<string, string>>

interface Parsed {
  readonly tree: ts.SourceFile
  /** Nom local → on viu i com s'hi diu allà. */
  readonly imports: Map<string, { file: string; name: string }>
  readonly functions: Map<string, ts.Node>
}

function resolve(from: string, spec: string, files: Files): string | null {
  let base: string
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`
  else if (spec.startsWith('.')) {
    const parts = from.split('/').slice(0, -1)
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.') parts.push(seg)
    }
    base = parts.join('/')
  } else return null
  const candidates = ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((s) => base + s)
  return candidates.find((c) => c in files) ?? null
}

function parse(file: string, source: string, files: Files): Parsed {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = new Map<string, { file: string; name: string }>()
  const functions = new Map<string, ts.Node>()

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolve(file, node.moduleSpecifier.text, files)
      const named = node.importClause?.namedBindings
      if (target !== null && named !== undefined && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          imports.set(el.name.text, { file: target, name: (el.propertyName ?? el.name).text })
        }
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      functions.set(node.name.text, node)
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      functions.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { tree, imports, functions }
}

function calls(node: ts.Node): string[] {
  const names: string[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.push(n.expression.text)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return names
}

interface Finding {
  readonly file: string
  readonly line: number
  readonly reason: string
}

/** Les mutacions que escriuen a una cua i no són `networkMode: 'always'`. */
function offenders(files: Files): Finding[] {
  const parsed = new Map(Object.entries(files).map(([f, s]) => [f, parse(f, s, files)]))
  const memo = new Map<string, boolean>()

  /** Aquesta crida, feta des de `file`, acaba escrivint a una cua? */
  const callWrites = (file: string, name: string, seen: Set<string>): boolean => {
    const imported = parsed.get(file)?.imports.get(name)
    if (imported !== undefined) {
      if (imported.file === QUEUE) return WRITERS.has(imported.name)
      return fnWrites(imported.file, imported.name, seen)
    }
    return fnWrites(file, name, seen)
  }

  const fnWrites = (file: string, name: string, seen: Set<string>): boolean => {
    const key = `${file}#${name}`
    const known = memo.get(key)
    if (known !== undefined) return known
    if (seen.has(key)) return false
    seen.add(key)
    const body = parsed.get(file)?.functions.get(name)
    const result = body !== undefined && calls(body).some((c) => callWrites(file, c, seen))
    // Un `false` que surt d'enmig d'un cicle encara no és definitiu.
    if (result || seen.size === 1) memo.set(key, result)
    return result
  }

  const found: Finding[] = []
  for (const [file, { tree, functions }] of parsed) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'useMutation'
      ) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1
        const [options] = node.arguments
        if (options === undefined || !ts.isObjectLiteralExpression(options)) {
          found.push({ file, line, reason: 'opcions que no es poden llegir' })
        } else {
          let fn: ts.Node | undefined
          let always = false
          for (const prop of options.properties) {
            const key =
              prop.name !== undefined && ts.isIdentifier(prop.name) ? prop.name.text : null
            if (key === 'mutationFn') {
              if (ts.isPropertyAssignment(prop)) {
                fn = ts.isIdentifier(prop.initializer)
                  ? (functions.get(prop.initializer.text) ?? prop.initializer)
                  : prop.initializer
              } else if (ts.isMethodDeclaration(prop)) fn = prop
            }
            if (
              key === 'networkMode' &&
              ts.isPropertyAssignment(prop) &&
              ts.isStringLiteralLike(prop.initializer) &&
              prop.initializer.text === 'always'
            ) {
              always = true
            }
          }
          const writes = fn !== undefined && calls(fn).some((c) => callWrites(file, c, new Set()))
          if (writes && !always) {
            found.push({ file, line, reason: "escriu a una cua i no és networkMode: 'always'" })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  return found
}

const REAL: Record<string, string> = {}
for (const f of globSync('src/**/*.{ts,tsx}')) {
  const path = f.replaceAll('\\', '/')
  if (!path.includes('.test.')) REAL[path] = readFileSync(f, 'utf8')
}

const QUEUE_SRC = 'export async function put() {}\nexport async function enqueue() {}\n'
const show = (list: Finding[]) => list.map((f) => `${f.file}:${String(f.line)} ${f.reason}`)

describe('el detector', () => {
  const base = { [QUEUE]: QUEUE_SRC }

  it('denuncia una mutació que escriu a la cua sense networkMode', () => {
    const list = offenders({
      ...base,
      'src/a/api.ts':
        "import { put } from '@/lib/queue'\nexport async function save() { await put() }",
      'src/a/Screen.tsx':
        "import { save } from './api'\nconst m = useMutation({ mutationFn: () => save() })",
    })
    expect(show(list)).toEqual([
      "src/a/Screen.tsx:2 escriu a una cua i no és networkMode: 'always'",
    ])
  })

  it('ho veu també a través de dues capes de funcions', () => {
    const list = offenders({
      ...base,
      'src/a/api.ts':
        "import { enqueue } from '@/lib/queue'\nasync function inner() { await enqueue() }\nexport async function outer() { await inner() }",
      'src/a/Screen.tsx':
        "import { outer } from './api'\nconst m = useMutation({ mutationFn: async () => { await outer() } })",
    })
    expect(list).toHaveLength(1)
  })

  it('accepta la mateixa mutació amb networkMode: always', () => {
    const list = offenders({
      ...base,
      'src/a/api.ts':
        "import { put } from '@/lib/queue'\nexport async function save() { await put() }",
      'src/a/Screen.tsx':
        "import { save } from './api'\nconst m = useMutation({ networkMode: 'always', mutationFn: () => save() })",
    })
    expect(list).toEqual([])
  })

  it('no demana res a una mutació que no toca la cua, encara que hi hagi un enqueue propi', () => {
    const list = offenders({
      ...base,
      'src/lib/storage.ts': 'function enqueue() {}\nexport function prefetch() { enqueue() }',
      'src/a/api.ts': 'export async function rpc() {}',
      'src/a/Screen.tsx':
        "import { prefetch } from '@/lib/storage'\nimport { rpc } from './api'\nuseMutation({ mutationFn: async () => { prefetch(); await rpc() } })",
    })
    expect(list).toEqual([])
  })

  it('denuncia unes opcions que no pot llegir', () => {
    const list = offenders({ ...base, 'src/a/S.tsx': 'useMutation(opts)' })
    expect(list).toHaveLength(1)
  })

  it('no es perd en un cicle de crides', () => {
    const list = offenders({
      ...base,
      'src/a/api.ts': 'export function a() { b() }\nexport function b() { a() }',
      'src/a/S.tsx': "import { a } from './api'\nuseMutation({ mutationFn: () => a() })",
    })
    expect(list).toEqual([])
  })
})

describe('les mutacions que escriuen a una cua', () => {
  it('veu les tres que avui escriuen, perquè una passada buida no vol dir res', () => {
    expect(Object.keys(REAL)).toContain(QUEUE)
    for (const f of [
      'src/features/checkin/CheckinBlock.tsx',
      'src/features/proposals/NewIdeaScreen.tsx',
      'src/features/gimcana/SubmitScreen.tsx',
    ]) {
      const stripped = REAL[f]?.replace(/^\s+networkMode: 'always',\r?\n/m, '') ?? ''
      expect(stripped).not.toBe(REAL[f])
      expect(offenders({ ...REAL, [f]: stripped }).map((x) => x.file)).toEqual([f])
    }
  })

  it('totes porten networkMode: always', () => {
    expect(show(offenders(REAL))).toEqual([])
  })
})

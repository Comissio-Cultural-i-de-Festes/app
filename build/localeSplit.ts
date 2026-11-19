import { globSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import { isDoorModule, isJuntaModule } from './precache.ts'

/**
 * Els textos de la junta, fora de l'entrada.
 *
 * El català viatja dins de l'entrada (`src/i18n/index.ts`), i amb ell anaven
 * els textos de les pantalles d'escriptori de la junta: un terç del fitxer, que
 * baixava cada soci en instal·lar l'app i que no llegirà mai.
 *
 * ON ES TALLA. Els fitxers d'idioma no es toquen: cada idioma continua sent un
 * sol fitxer, i la clau nova va on ha anat sempre. El tall el fa aquest
 * connector quan algú importa un fitxer amb una d'aquestes dues consultes:
 *
 *   - `ca.json?app`: tot, menys el que hi ha sota `junta.` i no fa servir res
 *     de fora de l'escriptori de la junta. És el que porta l'entrada, i el que
 *     es baixa el castellà o l'anglès quan algú hi llegeix.
 *   - `ca.json?junta`: la resta de `junta.`. Es baixa amb les pantalles
 *     d'escriptori (`src/features/shell/JuntaStrings.tsx`), i no va a la
 *     precache.
 *
 * QUÈ ÉS «DE FORA». Les claus de la junta que la porta necessita sense xarxa
 * —el rebedor, l'escàner, l'alta a mà, els punts, la cua de la gimcana— i les
 * que alguna pantalla de soci fa servir s'han de quedar a l'entrada. No hi ha
 * cap llista: es llegeix el codi. Es parteix de tot el que no és de la zona de
 * junta i de la porta (`build/precache.ts`), se segueixen els seus `import`
 * estàtics fins al final, i tota clau `junta.…` que hi surti es queda. Un
 * `import()` no se segueix: és el que separa una pantalla d'escriptori de la
 * porta. És el mateix graf que decideix la precache, llegit amb el mateix
 * criteri, i `build/precache.test.ts` el contrasta amb el que rolldown ha fet
 * de debò.
 *
 * Es va descartar partir els fitxers (un `junta.json` per idioma, o un espai de
 * noms propi d'i18next). Era el tall més evident, però cada text nou de la
 * junta hauria hagut de triar fitxer segons qui el llegeix, i encertar-ho a mà:
 * una clau de la porta posada al fitxer de la junta és una clau crua a la casa
 * rural, sense xarxa, i no es veu fins aleshores. Un espai de noms, a més,
 * volia dir canviar totes les crides `t('junta.…')`. Així qui afegeix un text
 * no ha de saber res d'això, i les proves de paritat i d'ús continuen llegint
 * els tres fitxers sencers.
 */

const DESK = 'junta'

const LOCALE = /\/src\/i18n\/locales\/[^/]+\.json$/

/** La part que demana un id, si n'és un: en `dev` Vite hi afegeix `import`. */
function partOf(id: string): 'app' | 'junta' | null {
  const [file = '', query = ''] = normal(id).split('?')
  if (!LOCALE.test(file)) return null
  const params = new URLSearchParams(query)
  return params.has('app') ? 'app' : params.has('junta') ? 'junta' : null
}

const PLURAL = /_(zero|one|two|few|many|other)$/

const normal = (path: string) => path.replaceAll('\\', '/')

/** Com es demana una clau: sencera, o pel principi d'un `t(\`junta.x.${…}\`)`. */
export interface KeyRef {
  readonly key: string
  readonly prefix: boolean
}

/** El mateix que fa `tests/i18n-usage.test.ts`: un exemple en un comentari no és una crida. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const KEY = new RegExp(`['"\`](${DESK}\\.[\\w.]*)(\\$\\{)?`, 'g')

/**
 * Tota cadena que comenci per `junta.`, dins d'un `t()` o no: hi ha claus que
 * passen per una variable abans d'arribar-hi. Una de més aquí és un text de més
 * a l'entrada; una de menys, una clau crua.
 */
export function keyRefs(source: string): KeyRef[] {
  return [...stripComments(source).matchAll(KEY)].map((m) => ({
    key: m[1] ?? '',
    prefix: m[2] !== undefined || (m[1] ?? '').endsWith('.'),
  }))
}

const IMPORT =
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w$*{}\s,]+\s+from\s+)?['"]([^'"\n]+)['"]/g

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/**
 * Els `import` estàtics d'un fitxer, ja resolts als fitxers que hi ha a
 * `sources`. Tots els camins amb `/`, també a Windows.
 */
export function staticImports(
  file: string,
  source: string,
  sources: ReadonlyMap<string, string>,
  src: string,
): string[] {
  const found: string[] = []
  for (const [, spec = ''] of stripComments(source).matchAll(IMPORT)) {
    let base: string
    if (spec.startsWith('@/')) base = posix.join(src, spec.slice(2))
    else if (spec.startsWith('.')) base = posix.join(posix.dirname(file), spec)
    else continue
    const hit = EXTENSIONS.map((ext) => base + ext).find((path) => sources.has(path))
    if (hit !== undefined) found.push(hit)
  }
  return found
}

/**
 * Les claus de la junta que fa servir algun fitxer de fora de l'escriptori.
 *
 * `sources` va de camí (amb `/`) a codi; `isRoot` diu des d'on es comença.
 */
export function keysOutsideDesk(
  sources: ReadonlyMap<string, string>,
  isRoot: (file: string) => boolean,
  src: string,
): KeyRef[] {
  const seen = new Set<string>()
  const pending = [...sources.keys()].filter(isRoot)
  const refs: KeyRef[] = []
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    const source = sources.get(file) ?? ''
    refs.push(...keyRefs(source))
    pending.push(...staticImports(file, source, sources, src))
  }
  return refs
}

function wanted(path: string, refs: readonly KeyRef[]): boolean {
  const base = path.replace(PLURAL, '')
  return refs.some(({ key, prefix }) =>
    prefix ? path.startsWith(key) : path === key || base === key || path.startsWith(`${key}.`),
  )
}

interface Tree {
  [key: string]: string | Tree
}

function setPath(tree: Tree, parts: readonly string[], value: string): void {
  let node = tree
  for (const part of parts.slice(0, -1)) {
    const next = node[part]
    if (typeof next === 'object') node = next
    else node = node[part] = {}
  }
  node[parts.at(-1) ?? ''] = value
}

function leaves(tree: Tree, prefix: string): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = `${prefix}.${key}`
    return typeof value === 'string' ? [[path, value] as [string, string]] : leaves(value, path)
  })
}

/** Les dues parts d'un idioma: la de l'entrada, i la de l'escriptori de la junta. */
export function splitLocale(tree: Tree, refs: readonly KeyRef[]): { app: Tree; junta: Tree } {
  const desk = tree[DESK]
  if (typeof desk !== 'object') return { app: tree, junta: {} }

  const kept: Tree = {}
  const cut: Tree = {}
  for (const [path, value] of leaves(desk, DESK)) {
    setPath(wanted(path, refs) ? kept : cut, path.split('.').slice(1), value)
  }
  return { app: { ...tree, [DESK]: kept }, junta: { [DESK]: cut } }
}

/** El que no és de la zona de junta, i la porta. */
const isRoot = (file: string) => !isJuntaModule(file) || isDoorModule(file)

function readSources(root: string): Map<string, string> {
  const files = globSync('src/**/*.{ts,tsx}', { cwd: root }).filter(
    (file) => !/\.test\.tsx?$/.test(file) && !file.endsWith('.d.ts'),
  )
  return new Map(
    files.map((file) => {
      const path = normal(join(root, file))
      return [path, readFileSync(path, 'utf8')]
    }),
  )
}

/** Les dues parts d'un fitxer d'idioma, llegint el codi de `root`. */
export function localePart(root: string, file: string, part: 'app' | 'junta'): Tree {
  const tree = JSON.parse(readFileSync(file, 'utf8')) as Tree
  const refs = keysOutsideDesk(readSources(root), isRoot, normal(join(root, 'src')))
  return splitLocale(tree, refs)[part]
}

/**
 * El connector. Torna JSON, i el converteix en mòdul el de Vite, com qualsevol
 * altre `.json`.
 *
 * El codi es torna a llegir cada vegada que es carrega una part, que és en cada
 * build i, en `dev`, quan canvia el fitxer d'idioma. En `dev` una clau de la
 * junta que una pantalla de la porta comenci a fer servir sense que el fitxer
 * d'idioma canviï no arriba a l'entrada fins que es torna a arrencar; a la zona
 * de junta no es nota, perquè el marc ja ha demanat la part de la junta.
 */
export function localeSplit() {
  let root = process.cwd()
  return {
    name: 'app-comi:locale-split',
    enforce: 'pre' as const,
    configResolved(config: { readonly root: string }) {
      root = config.root
    },
    load(id: string) {
      const part = partOf(id)
      if (part === null) return null
      const json = JSON.stringify(localePart(root, id.slice(0, id.indexOf('?')), part))
      return `export default JSON.parse(${JSON.stringify(json)})`
    },
  }
}

import { globSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

import ts from 'typescript'

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

/** El que importa d'un fitxer: les claus de la junta que esmenta, i què importa. */
export interface Facts {
  readonly refs: readonly KeyRef[]
  readonly imports: readonly string[]
}

/**
 * Llegit amb l'analitzador de TypeScript, i no amb expressions regulars. Amb
 * regex, treure els comentaris abans de buscar-hi claus es menjava el codi que
 * venia després d'un `'./locales/*.json'`, fins al primer `*\/`: el `/*` de dins
 * la cadena semblava l'obertura d'un comentari. Avui no queia cap clau, però és
 * el tipus d'error que un dia en fa caure una de la porta. L'arbre sap què és
 * una cadena, què és un comentari i què és un `import`.
 *
 * Totes les cadenes que comencen per `junta.`, dins d'un `t()` o no: hi ha claus
 * que passen per una variable abans d'arribar-hi. Una de més aquí és un text de
 * més a l'entrada; una de menys, una clau crua. D'una plantilla, el principi fix.
 *
 * Els `import` estàtics, també els que només executen el fitxer i els
 * `export … from`. Els de tipus no, que no porten codi; ni els `import()`.
 */
export function factsOf(file: string, source: string): Facts {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, kind)
  const refs: KeyRef[] = []
  const imports: string[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly === true
        : node.isTypeOnly
      if (!typeOnly) imports.push(node.moduleSpecifier.text)
      return
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.startsWith(`${DESK}.`))
        refs.push({ key: node.text, prefix: node.text.endsWith('.') })
    } else if (ts.isTemplateExpression(node) && node.head.text.startsWith(`${DESK}.`)) {
      refs.push({ key: node.head.text, prefix: true })
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return { refs, imports }
}

/** Per a les proves: les claus d'un tros de codi. */
export function keyRefs(source: string): KeyRef[] {
  return [...factsOf('x.tsx', source).refs]
}

/** Analitzar un fitxer costa; si el codi no ha canviat, el resultat tampoc. */
const analysed = new Map<string, { readonly source: string; readonly facts: Facts }>()

function cachedFacts(file: string, source: string): Facts {
  const hit = analysed.get(file)
  if (hit?.source === source) return hit.facts
  const facts = factsOf(file, source)
  analysed.set(file, { source, facts })
  return facts
}

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/**
 * Un `import` resolt al fitxer de `sources` que porta. Tots els camins amb `/`,
 * també a Windows.
 */
function resolveImport(
  file: string,
  spec: string,
  sources: ReadonlyMap<string, string>,
  src: string,
): string | undefined {
  let base: string
  if (spec.startsWith('@/')) base = posix.join(src, spec.slice(2))
  else if (spec.startsWith('.')) base = posix.join(posix.dirname(file), spec)
  else return undefined
  return EXTENSIONS.map((ext) => base + ext).find((path) => sources.has(path))
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
    const facts = cachedFacts(file, sources.get(file) ?? '')
    refs.push(...facts.refs)
    for (const spec of facts.imports) {
      const hit = resolveImport(file, spec, sources, src)
      if (hit !== undefined) pending.push(hit)
    }
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

/** Les claus que es queden, en una cadena que es pot comparar. */
function keptSignature(refs: readonly KeyRef[]): string {
  return JSON.stringify(
    [...new Set(refs.map(({ key, prefix }) => `${key}${prefix ? '*' : ''}`))].sort(),
  )
}

/** Les dues parts d'un fitxer d'idioma, llegint el codi de `root`. */
export function localePart(root: string, file: string, part: 'app' | 'junta'): Tree {
  const tree = JSON.parse(readFileSync(file, 'utf8')) as Tree
  return splitLocale(tree, refsOf(root))[part]
}

function refsOf(root: string): KeyRef[] {
  return keysOutsideDesk(readSources(root), isRoot, normal(join(root, 'src')))
}

/** Prou del servidor de `dev` per fer-hi tornar a carregar els idiomes. */
interface DevServer {
  readonly moduleGraph: {
    getModulesByFile(file: string): ReadonlySet<object> | undefined
    invalidateModule(module: object): void
  }
  readonly ws: { send(payload: { type: 'full-reload' }): void }
}

/**
 * El connector. Torna el mòdul ja fet, `export default JSON.parse(…)`, que és
 * el que Vite fa amb un `.json` gran; el seu connector de JSON no el toca,
 * perquè la consulta el deixa passar en `dev` i no en el build.
 *
 * El codi es torna a llegir cada vegada que es carrega una part: en cada build
 * i, en `dev`, quan canvia el fitxer d'idioma. En `dev`, a més, quan es desa un
 * fitxer de codi es mira si ha canviat quines claus de la junta es queden a
 * l'app, i només si ha canviat es tornen a fer les parts i es recarrega la
 * pàgina: una clau nova en una pantalla de la porta no demana tornar a arrencar
 * Vite, i desar qualsevol altra cosa continua sent un canvi en calent. Tornar a
 * mirar-ho només analitza el fitxer que ha canviat.
 */
export function localeSplit() {
  let root = process.cwd()
  let kept = ''
  return {
    name: 'app-comi:locale-split',
    enforce: 'pre' as const,
    configResolved(config: { readonly root: string }) {
      root = config.root
    },
    load(id: string) {
      const part = partOf(id)
      if (part === null) return null
      const file = id.slice(0, id.indexOf('?'))
      const refs = refsOf(root)
      kept = keptSignature(refs)
      const tree = JSON.parse(readFileSync(file, 'utf8')) as Tree
      const json = JSON.stringify(splitLocale(tree, refs)[part])
      return `export default JSON.parse(${JSON.stringify(json)})`
    },
    handleHotUpdate({ file, server }: { readonly file: string; readonly server: DevServer }) {
      const path = normal(file)
      if (kept === '' || !/\/src\/.+\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path)) return
      const now = keptSignature(refsOf(root))
      if (now === kept) return
      kept = now
      for (const locale of globSync('src/i18n/locales/*.json', { cwd: root })) {
        const modules = server.moduleGraph.getModulesByFile(normal(join(root, locale)))
        for (const module of modules ?? []) server.moduleGraph.invalidateModule(module)
      }
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  closure,
  isJuntaModule,
  isJuntaOnly,
  isLocaleModule,
  isOnlineOnly,
  isOnlineOnlyModule,
  keptFiles,
  leftOutFiles,
  staticClosure,
  type BundleItem,
} from './precache'

/**
 * El que es baixa a la instal·lació, comprovat sobre un build de debò.
 *
 * Un build i no el `vite.config.ts` llegit com a text: el que importa és quins
 * trossos acaben a la llista del service worker, i això depèn de com els parteix
 * rolldown, que no es veu al fitxer de configuració. Llegint noms de fitxer s'hi
 * cau de seguida: `Button-*.js` és un tros a part, però l'importa l'Inici i ha
 * de ser a la precache.
 *
 * Els dos sentits fallen. Una pantalla d'escriptori de la junta o el mapa que
 * tornen a la llista són pes a cada telèfon que instal·la l'app; un tros d'un
 * soci o de la porta que en surt és una pantalla que no s'obre sense cobertura,
 * i això no ho veu ningú fins que és a la casa rural.
 */

type Chunk = Extract<BundleItem, { type: 'chunk' }> & {
  readonly name: string
  readonly facadeModuleId: string | null
  readonly isDynamicEntry: boolean
}

let out = ''
let bundle: Record<string, BundleItem> = {}
let chunks: Chunk[] = []
let precached = new Set<string>()
let sw = ''

beforeAll(async () => {
  // Les del CI. L'entorn de les proves no porta el color, i `vite.config.ts`
  // no deixa construir sense; i `NODE_ENV=test` faria un build de React de
  // desenvolupament, amb trossos que no són els que es publiquen.
  out = mkdtempSync(join(tmpdir(), 'precache-'))
  vi.stubEnv('VITE_THEME_COLOR', '#100909')
  vi.stubEnv('NODE_ENV', 'production')
  let result: Awaited<ReturnType<typeof build>>
  try {
    result = await build({
      configFile: 'vite.config.ts',
      logLevel: 'silent',
      build: { outDir: out, emptyOutDir: true, sourcemap: false },
    })
  } finally {
    vi.unstubAllEnvs()
  }

  const output = (Array.isArray(result) ? result[0] : result) as {
    output: readonly BundleItem[]
  }
  bundle = Object.fromEntries(output.output.map((item) => [item.fileName, item]))
  chunks = output.output.filter((item): item is Chunk => item.type === 'chunk')

  sw = readFileSync(join(out, 'sw.js'), 'utf8')
  const list = /precacheAndRoute\(\[(.*?)\]/s.exec(sw)?.[1] ?? ''
  precached = new Set([...list.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] ?? ''))
}, 180_000)

afterAll(() => {
  if (out !== '') rmSync(out, { recursive: true, force: true })
})

const chunkNamed = (name: string) =>
  chunks.find((c) => c.isDynamicEntry && c.name === name && c.facadeModuleId !== null)

const chunkWith = (path: string) =>
  chunks.find((c) => c.moduleIds.some((id) => id.replaceAll('\\', '/').endsWith(path)))

describe('the install', () => {
  it('precaches everything the first screen loads', () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8')
    const fromHtml = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1])

    expect(fromHtml.length).toBeGreaterThan(1)
    for (const file of [...fromHtml, ...staticClosure(bundle)]) {
      expect(precached, `${file} is loaded at startup`).toContain(file)
    }
    expect(precached).toContain('index.html')
  })

  it('weighs less than 400 KB gzipped, which is what the issue asked of an install', () => {
    // Fitxer per fitxer i a nivell 9, cadascun una sola vegada: Workbox no
    // baixa dues vegades una entrada repetida. Quan això falli, la pregunta no
    // és com tornar-hi a cabre sinó qui ha de baixar el que s'hi ha afegit.
    let total = 0
    for (const file of precached)
      total += gzipSync(readFileSync(join(out, file)), { level: 9 }).length
    expect(total, `${(total / 1000).toFixed(1)} KB`).toBeLessThan(400_000)
  })

  it('leaves the two install icons to the browser, and keeps the ones a page or a push uses', () => {
    expect(precached).not.toContain('pwa-512x512.png')
    expect(precached).not.toContain('pwa-maskable-512x512.png')
    for (const icon of ['pwa-192x192.png', 'apple-touch-icon.png', 'favicon.png']) {
      expect(precached).toContain(icon)
    }
  })

  it.each([
    ['ScannerScreen', 'src/features/door/ScannerScreen.tsx'],
    ['ManualScreen', 'src/features/door/ManualScreen.tsx'],
    ['PointsScreen', 'src/features/door/PointsScreen.tsx'],
    ['GimcanaValidateScreen', 'src/features/junta/GimcanaValidateScreen.tsx'],
    ['JuntaHome, the only way to the scanner', 'src/features/junta/JuntaHome.tsx'],
    ['verdict', 'src/features/door/verdict.ts'],
    ['decoder', 'src/features/door/decoder.ts'],
    ['ponyfill', 'barcode-detector/dist/es/zxing-exported.js'],
    ['JuntaLayout, the frame that draws the junta home', 'src/features/shell/JuntaLayout.tsx'],
    ['SessionGate, the saved QR with no session', 'src/features/shell/SessionGate.tsx'],
  ])('keeps the door: %s', (_name, path) => {
    // La porta s'ha d'obrir sense xarxa després de cada desplegament, també si
    // ningú no ha tornat a entrar a la zona de junta: el perquè, a precache.ts.
    const chunk = chunkWith(path)
    expect(chunk, `no chunk carries ${path}: was it moved?`).toBeDefined()
    expect(precached).toContain(chunk?.fileName)
  })

  it.each([
    ['EventFormScreen', 'la junta'],
    ['AuditScreen', 'la junta'],
    ['DashboardScreen', 'la junta'],
    ['MemberScreen', 'la junta'],
    ['GeoMap', 'el mapa'],
  ])('leaves %s (%s) out of it', (name) => {
    const chunk = chunkNamed(name)
    expect(chunk, `no dynamic chunk called ${name}: was it renamed?`).toBeDefined()
    expect(precached).not.toContain(chunk?.fileName)
  })

  it('keeps Catalan, which travels inside the entry', () => {
    const chunk = chunkWith('src/i18n/locales/ca.json')
    expect(chunk?.isEntry).toBe(true)
    expect(precached).toContain(chunk?.fileName)
  })

  it.each([
    ['Spanish', 'src/i18n/locales/es.json'],
    ['English', 'src/i18n/locales/en.json'],
  ])('leaves %s out, for the chunks cache to keep once it is read', (_name, path) => {
    // Cada persona en llegeix un, i la regla `chunks` el desa la primera
    // vegada que es demana: ha de quedar a sota de `/assets/` i ser un `.js`.
    const chunk = chunkWith(path)
    expect(chunk, `no chunk carries ${path}: was it moved?`).toBeDefined()
    expect(chunk?.isDynamicEntry).toBe(true)
    expect(chunk?.fileName).toMatch(/^assets\/[^/]+\.js$/)
    expect(precached).not.toContain(chunk?.fileName)
  })

  it("leaves the map's stylesheet out too", () => {
    const css = [...(chunkNamed('GeoMap')?.viteMetadata?.importedCss ?? [])]
    expect(css.length).toBeGreaterThan(0)
    for (const file of css) expect(precached).not.toContain(file)
  })

  it('brings along everything each precached chunk imports', () => {
    const inPrecache = chunks.filter((c) => precached.has(c.fileName))
    expect(inPrecache.length).toBeGreaterThan(10)
    for (const c of inPrecache) {
      for (const file of closure(bundle, [c.fileName])) {
        expect(precached, `${c.fileName} imports ${file}`).toContain(file)
      }
    }
  })

  it('leaves out every junta-only chunk that nothing kept imports', () => {
    const kept = keptFiles(bundle)
    const out = chunks.filter((c) => isJuntaOnly(c) && !kept.has(c.fileName))

    expect(out.length).toBeGreaterThan(15)
    for (const c of out) expect(precached, c.fileName).not.toContain(c.fileName)
  })

  it("keeps every chunk that carries any of a member's code", () => {
    const members = chunks.filter((c) =>
      c.moduleIds.some(
        (id) =>
          !id.startsWith('\0') &&
          !isJuntaModule(id) &&
          !isLocaleModule(id) &&
          !isOnlineOnlyModule(id),
      ),
    )

    expect(members.length).toBeGreaterThan(3)
    for (const c of members) expect(precached, c.fileName).toContain(c.fileName)
  })

  it('leaves out the traveller-details form, which does nothing offline', () => {
    const screen = chunks.find((c) =>
      c.moduleIds.some((id) => id.replaceAll('\\', '/').endsWith('/event/ViatgerScreen.tsx')),
    )
    expect(screen).toBeDefined()
    expect(isOnlineOnly(screen as Extract<BundleItem, { type: 'chunk' }>)).toBe(true)
    expect(precached).not.toContain(screen?.fileName)
  })

  it('serves what it left out from a bounded cache once it has been fetched', () => {
    expect(sw).toMatch(/new \w+\.CacheFirst\(\{cacheName:"chunks"/)
    expect(sw).toMatch(
      /cacheName:"chunks",(?:matchOptions:\{[^}]*\},)?plugins:\[[^\]]*ExpirationPlugin\(\{maxEntries:\d+/,
    )
  })

  it('finds a chunk stored by a fetch() when an import() asks for it', () => {
    // Una primera visita el desa amb un `fetch()` (src/lib/firstControl.ts);
    // l'`import()` d'després porta `Origin`, i amb `Vary: Origin` no casaria.
    const rule = /cacheName:"chunks",(.*?)\}\),"GET"\)/.exec(sw)?.[1]
    expect(rule).toMatch(/matchOptions:\{ignoreVary:(?:!0|true)\}/)
  })

  it.each(['chunks', 'wasm'])('never stores an html page in the %s cache', (name) => {
    const rule = new RegExp(
      `cacheName:"${name}",(?:matchOptions:\\{[^}]*\\},)?plugins:\\[(.*?)\\]\\}\\),"GET"\\)`,
    ).exec(sw)?.[1]
    expect(rule, `no ${name} rule in sw.js`).toBeDefined()
    expect(rule).toMatch(/CacheableResponsePlugin\(\{statuses:\[200\]\}\)/)
    expect(rule).toMatch(/cacheWillUpdate/)
    expect(rule).toMatch(/text\/html/)
  })
})

describe('leftOutFiles', () => {
  const chunk = (
    fileName: string,
    moduleIds: string[],
    extra: Partial<Extract<BundleItem, { type: 'chunk' }>> = {},
  ): BundleItem => ({
    type: 'chunk',
    fileName,
    isEntry: false,
    imports: [],
    moduleIds,
    ...extra,
  })
  const entry = chunk('index.js', ['/app/src/main.tsx'], { isEntry: true })

  it('keeps a junta-only chunk that the entry imports statically', () => {
    // El parany: rolldown treu el codi compartit a trossos propis, i l'entrada
    // en pot necessitar un que només tingui mòduls de la junta.
    const graph = {
      'index.js': chunk('index.js', ['/app/src/main.tsx'], {
        isEntry: true,
        imports: ['nav.js'],
      }),
      'nav.js': chunk('nav.js', ['/app/src/features/junta/JuntaNav.tsx']),
    }
    expect(leftOutFiles(graph)).toEqual(new Set())
  })

  it('leaves out a lazy junta or map chunk, and its css', () => {
    const graph = {
      'index.js': entry,
      'map.js': chunk(
        'map.js',
        [
          '/app/node_modules/leaflet/dist/leaflet-src.js',
          'C:\\app\\src\\features\\junta\\GeoMap.tsx',
        ],
        { viteMetadata: { importedCss: new Set(['map.css']) } },
      ),
      'map.css': { type: 'asset', fileName: 'map.css' },
    } satisfies Record<string, BundleItem>
    expect(leftOutFiles(graph)).toEqual(new Set(['map.js', 'map.css']))
  })

  it('keeps the door, and the junta-only chunks it imports', () => {
    const graph = {
      'index.js': entry,
      'scanner.js': chunk('scanner.js', ['C:\\app\\src\\features\\door\\ScannerScreen.tsx'], {
        imports: ['eventsApi.js'],
      }),
      'eventsApi.js': chunk('eventsApi.js', ['/app/src/features/junta/eventsApi.ts']),
      'home.js': chunk('home.js', ['/app/src/features/junta/JuntaHome.tsx']),
      'audit.js': chunk('audit.js', ['/app/src/features/junta/AuditScreen.tsx'], {
        imports: ['eventsApi.js'],
      }),
    }
    expect(leftOutFiles(graph)).toEqual(new Set(['audit.js']))
  })

  it('keeps what a kept lazy chunk imports, however deep', () => {
    const graph = {
      'index.js': entry,
      'gallery.js': chunk('gallery.js', ['/app/src/features/gallery/G.tsx'], {
        imports: ['a.js'],
      }),
      'a.js': chunk('a.js', ['/app/src/features/junta/a.ts'], { imports: ['b.js'] }),
      'b.js': chunk('b.js', ['/app/src/features/junta/b.ts'], {
        viteMetadata: { importedCss: new Set(['b.css']) },
      }),
      'b.css': { type: 'asset', fileName: 'b.css' },
    } satisfies Record<string, BundleItem>
    expect(leftOutFiles(graph)).toEqual(new Set())
  })

  it('keeps a lazy chunk that mixes in anything else', () => {
    const graph = {
      'index.js': entry,
      'mixed.js': chunk('mixed.js', [
        '/app/src/features/junta/avis.ts',
        '/app/src/features/gimcana/api.ts',
      ]),
    }
    expect(leftOutFiles(graph)).toEqual(new Set())
  })

  it('leaves out a lazy language chunk, and keeps one the entry imports', () => {
    const graph = {
      'index.js': chunk('index.js', ['/app/src/main.tsx'], {
        isEntry: true,
        imports: ['ca.js'],
      }),
      'ca.js': chunk('ca.js', ['/app/src/i18n/locales/ca.json']),
      'es.js': chunk('es.js', ['C:\\app\\src\\i18n\\locales\\es.json']),
      'en.js': chunk('en.js', ['/app/src/i18n/locales/en.json']),
    }
    expect(leftOutFiles(graph)).toEqual(new Set(['es.js', 'en.js']))
  })

  it('ignores virtual modules when deciding', () => {
    const graph = {
      'index.js': entry,
      'desk.js': chunk('desk.js', ['\0vite/preload-helper.js', '/app/src/features/junta/x.ts']),
      'helper.js': chunk('helper.js', ['\0rolldown/runtime.js']),
    }
    expect(leftOutFiles(graph)).toEqual(new Set(['desk.js']))
  })

  it("keeps a stylesheet that a member's lazy chunk also imports", () => {
    const graph = {
      'index.js': entry,
      'a.js': chunk('a.js', ['/app/src/features/junta/A.tsx'], {
        viteMetadata: { importedCss: new Set(['shared.css']) },
      }),
      'b.js': chunk('b.js', ['/app/src/features/gallery/B.tsx'], {
        viteMetadata: { importedCss: new Set(['shared.css']) },
      }),
      'shared.css': { type: 'asset', fileName: 'shared.css' },
    } satisfies Record<string, BundleItem>
    expect(leftOutFiles(graph)).toEqual(new Set(['a.js']))
  })
})

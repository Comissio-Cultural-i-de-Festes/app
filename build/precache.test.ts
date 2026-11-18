// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { isJuntaModule, juntaOnlyFiles, staticClosure, type BundleItem } from './precache'

/**
 * El que es baixa a la instal·lació, comprovat sobre un build de debò.
 *
 * Un build i no el `vite.config.ts` llegit com a text: el que importa és quins
 * trossos acaben a la llista del service worker, i això depèn de com els parteix
 * rolldown, que no es veu al fitxer de configuració. El primer intent d'aquesta
 * feina s'hauria equivocat justament aquí: `Button-*.js` és un tros a part, però
 * l'importa l'Inici i ha de ser a la precache.
 *
 * Els dos sentits fallen. Un tros de la junta, de la porta o del mapa que torna a
 * la llista és pes a cada telèfon que s'instal·la l'app; un tros d'un soci que en
 * surt és una pantalla que no s'obre sense cobertura, i això no ho veu ningú fins
 * que és a la casa rural.
 */

type Chunk = Extract<BundleItem, { type: 'chunk' }> & {
  readonly name: string
  readonly facadeModuleId: string | null
  readonly isDynamicEntry: boolean
}

const OUT = mkdtempSync(join(tmpdir(), 'precache-'))
let bundle: Record<string, BundleItem> = {}
let chunks: Chunk[] = []
let precached = new Set<string>()
let sw = ''

beforeAll(async () => {
  // Les del CI. L'entorn de les proves no porta el color, i `vite.config.ts`
  // no deixa construir sense; i `NODE_ENV=test` faria un build de React de
  // desenvolupament, amb trossos que no són els que es publiquen.
  vi.stubEnv('VITE_THEME_COLOR', '#100909')
  vi.stubEnv('NODE_ENV', 'production')
  const result = await build({
    configFile: 'vite.config.ts',
    logLevel: 'silent',
    build: { outDir: OUT, emptyOutDir: true, sourcemap: false },
  })
  vi.unstubAllEnvs()

  const output = (Array.isArray(result) ? result[0] : result) as {
    output: readonly BundleItem[]
  }
  bundle = Object.fromEntries(output.output.map((item) => [item.fileName, item]))
  chunks = output.output.filter((item): item is Chunk => item.type === 'chunk')

  sw = readFileSync(join(OUT, 'sw.js'), 'utf8')
  const list = /precacheAndRoute\(\[(.*?)\]/s.exec(sw)?.[1] ?? ''
  precached = new Set([...list.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] ?? ''))
}, 180_000)

afterAll(() => {
  rmSync(OUT, { recursive: true, force: true })
})

const chunkNamed = (name: string) =>
  chunks.find((c) => c.isDynamicEntry && c.name === name && c.facadeModuleId !== null)

describe('the install', () => {
  it('precaches everything the first screen loads', () => {
    const html = readFileSync(join(OUT, 'index.html'), 'utf8')
    const fromHtml = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1])

    expect(fromHtml.length).toBeGreaterThan(1)
    for (const file of [...fromHtml, ...staticClosure(bundle)]) {
      expect(precached, `${file} is loaded at startup`).toContain(file)
    }
    expect(precached).toContain('index.html')
  })

  it.each([
    ['ScannerScreen', 'la porta'],
    ['ManualScreen', 'la porta'],
    ['PointsScreen', 'la porta'],
    ['JuntaHome', 'la junta'],
    ['EventFormScreen', 'la junta'],
    ['GeoMap', 'el mapa'],
    ['ponyfill', 'el lector de QR'],
  ])('leaves %s (%s) out of it', (name) => {
    const chunk = chunkNamed(name)
    expect(chunk, `no dynamic chunk called ${name}: was it renamed?`).toBeDefined()
    expect(precached).not.toContain(chunk?.fileName)
  })

  it("leaves the map's stylesheet out too", () => {
    const css = [...(chunkNamed('GeoMap')?.viteMetadata?.importedCss ?? [])]
    expect(css.length).toBeGreaterThan(0)
    for (const file of css) expect(precached).not.toContain(file)
  })

  it('leaves out every chunk made only of junta code that startup does not need', () => {
    const closure = staticClosure(bundle)
    const juntaOnly = chunks.filter(
      (c) =>
        !closure.has(c.fileName) &&
        c.moduleIds.filter((id) => !id.startsWith('\0')).every(isJuntaModule),
    )

    expect(juntaOnly.length).toBeGreaterThan(20)
    for (const c of juntaOnly) expect(precached, c.fileName).not.toContain(c.fileName)
  })

  it("keeps every chunk that carries any of a member's code", () => {
    const members = chunks.filter((c) =>
      c.moduleIds.some((id) => !id.startsWith('\0') && !isJuntaModule(id)),
    )

    expect(members.length).toBeGreaterThan(3)
    for (const c of members) expect(precached, c.fileName).toContain(c.fileName)
  })

  it('serves what it left out from a bounded cache once it has been fetched', () => {
    expect(sw).toMatch(/cacheName:"chunks"/)
    expect(sw).toMatch(/new \w+\.CacheFirst\(\{cacheName:"chunks"/)
    expect(sw).toMatch(/cacheName:"chunks",plugins:\[[^\]]*ExpirationPlugin\(\{maxEntries:\d+/)
  })
})

describe('juntaOnlyFiles', () => {
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
    expect(juntaOnlyFiles(graph)).toEqual(new Set())
  })

  it('leaves out a lazy chunk with only junta, door or map modules, and its css', () => {
    const graph = {
      'index.js': chunk('index.js', ['/app/src/main.tsx'], { isEntry: true }),
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
    expect(juntaOnlyFiles(graph)).toEqual(new Set(['map.js', 'map.css']))
  })

  it('keeps a lazy chunk that mixes in anything else', () => {
    const graph = {
      'index.js': chunk('index.js', ['/app/src/main.tsx'], { isEntry: true }),
      'mixed.js': chunk('mixed.js', [
        '/app/src/features/door/verdict.ts',
        '/app/src/features/gimcana/api.ts',
      ]),
    }
    expect(juntaOnlyFiles(graph)).toEqual(new Set())
  })

  it('ignores virtual modules when deciding', () => {
    const graph = {
      'index.js': chunk('index.js', ['/app/src/main.tsx'], { isEntry: true }),
      'door.js': chunk('door.js', ['\0vite/preload-helper.js', '/app/src/features/door/x.ts']),
      'helper.js': chunk('helper.js', ['\0rolldown/runtime.js']),
    }
    expect(juntaOnlyFiles(graph)).toEqual(new Set(['door.js']))
  })

  it("keeps a stylesheet that a member's lazy chunk also imports", () => {
    const graph = {
      'index.js': chunk('index.js', ['/app/src/main.tsx'], { isEntry: true }),
      'a.js': chunk('a.js', ['/app/src/features/junta/A.tsx'], {
        viteMetadata: { importedCss: new Set(['shared.css']) },
      }),
      'b.js': chunk('b.js', ['/app/src/features/gallery/B.tsx'], {
        viteMetadata: { importedCss: new Set(['shared.css']) },
      }),
      'shared.css': { type: 'asset', fileName: 'shared.css' },
    } satisfies Record<string, BundleItem>
    expect(juntaOnlyFiles(graph)).toEqual(new Set(['a.js']))
  })
})

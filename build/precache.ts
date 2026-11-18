/**
 * Què baixa un telèfon el dia que instal·la l'app, i què es deixa per després.
 *
 * La precache és el que el service worker baixa sencer a la instal·lació, i ho
 * baixa tothom. Fins ara hi entrava tot el que sortia del build, i més d'una
 * quarta part del pes era la zona de junta, la porta i el mapa: codi que obre un
 * de cada vint socis i que la resta arrossegava per la mateixa wifi saturada.
 *
 * LA REGLA: un tros surt de la precache si l'arrencada no l'importa i tot el que
 * porta és de la zona de junta. Les dues condicions fan falta, i cap no es pot
 * llegir del nom del fitxer:
 *
 *   - Rolldown treu a trossos propis el codi que comparteixen diverses
 *     pantalles. `Button-*.js` és un tros a part i l'importa l'Inici; un dia
 *     n'hi pot haver un que només tingui mòduls de `features/junta/` i que
 *     també l'importi l'Inici (la barra de la junta, per exemple). Treure'l
 *     seria trencar l'arrencada sense xarxa, i per això el que l'arrencada
 *     importa no surt mai.
 *   - Un tros que es carrega a demanda però que porta alguna cosa d'un soci es
 *     queda. Si demà una pantalla de soci passa a `lazy()`, el pitjor que pot
 *     passar és que la precache pesi el mateix que avui.
 *
 * O sigui que la decisió es pren sobre el graf del build, amb els camins dels
 * mòduls, i no amb noms de tros ni amb hashos. Es va descartar agrupar la zona
 * en trossos amb nom propi (`manualChunks`): desfeia la partició pantalla per
 * pantalla que fa `App.tsx`, i el nom continuaria sense dir si l'Inici en depèn.
 *
 * ELS IDIOMES no hi entren. Avui els tres viatgen dins de l'Inici (s'importen
 * com a JSON), o sigui que no hi ha cap tros a treure. El dia que es carreguin a
 * demanda seran trossos lazy que no són de la junta, i aquesta regla els deixarà
 * a la precache, que és el costat segur: qui els separi ha de decidir si els
 * dos que no es fan servir s'han de quedar fora, i com arriben sense xarxa.
 *
 * El que surt d'aquí no es perd: el guarda una memòria cau `CacheFirst` la
 * primera vegada que es demana (`vite.config.ts`). La porta, que és el que s'ha
 * d'obrir sense xarxa, es demana per avançat en entrar a la zona de junta
 * (`features/door/preload.ts`).
 */

/** Prou de la sortida de rolldown per recórrer el graf. */
export type BundleItem =
  | {
      readonly type: 'chunk'
      readonly fileName: string
      readonly isEntry: boolean
      readonly imports: readonly string[]
      readonly moduleIds: readonly string[]
      readonly viteMetadata?: { readonly importedCss: ReadonlySet<string> } | undefined
    }
  | { readonly type: 'asset'; readonly fileName: string }

type Chunk = Extract<BundleItem, { type: 'chunk' }>

/**
 * La zona de junta: les seves pantalles, la porta, i les dues biblioteques que
 * només fan servir elles —Leaflet per al mapa, i el lector de QR amb el seu wasm.
 */
const JUNTA_ZONE = [
  /\/src\/features\/junta\//,
  /\/src\/features\/door\//,
  /\/node_modules\/leaflet\//,
  /\/node_modules\/barcode-detector\//,
  /\/node_modules\/zxing-wasm\//,
]

export function isJuntaModule(id: string): boolean {
  const path = id.replaceAll('\\', '/')
  return JUNTA_ZONE.some((zone) => zone.test(path))
}

/** El que es carrega sense cap `import()`: l'entrada i tot el que importa. */
export function staticClosure(bundle: Readonly<Record<string, BundleItem>>): Set<string> {
  const seen = new Set<string>()
  const pending = Object.values(bundle)
    .filter((item): item is Chunk => item.type === 'chunk' && item.isEntry)
    .map((chunk) => chunk.fileName)

  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    const item = bundle[file]
    if (item?.type !== 'chunk') continue
    pending.push(...item.imports)
    for (const css of item.viteMetadata?.importedCss ?? []) seen.add(css)
  }
  return seen
}

/** Els fitxers que no han d'anar a la precache. */
export function juntaOnlyFiles(bundle: Readonly<Record<string, BundleItem>>): Set<string> {
  const closure = staticClosure(bundle)
  const out = new Set<string>()
  const cssKept = new Set<string>()

  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk' || closure.has(item.fileName)) continue
    // `\0` és un mòdul virtual —el runtime de rolldown, l'ajudant de
    // precàrrega de Vite—: no és de ningú, i no decideix res.
    const real = item.moduleIds.filter((id) => !id.startsWith('\0'))
    const junta = real.length > 0 && real.every(isJuntaModule)
    if (junta) out.add(item.fileName)
    for (const css of item.viteMetadata?.importedCss ?? []) {
      if (junta) out.add(css)
      else cssKept.add(css)
    }
  }

  // Un full d'estils que també fa servir un tros que es queda, es queda.
  for (const css of cssKept) out.delete(css)
  for (const file of closure) out.delete(file)
  return out
}

/**
 * El connector amb el build: un connector de Vite que llegeix el graf quan el
 * build l'acaba, i el filtre que Workbox aplica a la llista de la precache.
 *
 * Workbox s'executa en tancar el build, després de `generateBundle`, i per això
 * el filtre pot llegir el que el connector ha deixat. Si un dia no hi arriba, el
 * conjunt és buit i la precache torna a tenir-ho tot: més pes, res trencat.
 */
export function juntaOutOfPrecache() {
  let excluded = new Set<string>()
  return {
    plugin: {
      name: 'app-comi:precache-junta',
      apply: 'build' as const,
      generateBundle(_options: unknown, bundle: Record<string, BundleItem>) {
        excluded = juntaOnlyFiles(bundle)
      },
    },
    manifestTransform: <T extends { readonly url: string }>(entries: T[]) => ({
      manifest: entries.filter((entry) => !excluded.has(entry.url)),
      warnings: [] as string[],
    }),
  }
}

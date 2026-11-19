/**
 * Què baixa un telèfon el dia que instal·la l'app, i què es deixa per després.
 *
 * La precache és el que el service worker baixa sencer a la instal·lació, i ho
 * baixa tothom. Fins ara hi entrava tot el que sortia del build, i més d'una
 * quarta part del pes era la zona de junta i el mapa: codi que obre un de cada
 * vint socis i que la resta arrossegava per la mateixa wifi saturada.
 *
 * LA REGLA es diu al revés: es decideix què es QUEDA, i surt la resta.
 *
 *   1. L'entrada.
 *   2. Tot tros que porti alguna cosa d'un soci que no sigui un idioma.
 *      Rolldown treu a trossos propis el codi compartit (`Button-*.js` és un
 *      tros a part i l'importa l'Inici), i un tros lazy que barreja codi de
 *      soci i de junta no és de la junta.
 *   3. La porta: l'escàner, l'alta a mà, els punts, la cua de la gimcana, el
 *      lector de QR, el rebedor de la junta, que és l'únic lloc des d'on
 *      s'arriba a l'escàner, i el marc de la zona que el pinta.
 *   4. Tot el que importen els anteriors, estàticament o com a full d'estils,
 *      fins que el conjunt ja no creix. Un tros a la precache que importa un tros
 *      que no hi és no s'obre sense xarxa, i aleshores tenir-lo a la precache no
 *      serveix de res.
 *
 * Surten, doncs, les pantalles d'escriptori de la junta, Leaflet, el castellà i
 * l'anglès.
 *
 * PER QUÈ LA PORTA ES QUEDA, encara que la gent de la junta sigui poca. Els
 * seus trossos importen l'`index-<hash>.js`, que canvia gairebé a cada
 * desplegament, i per tant ells també. Amb `autoUpdate` el telèfon carrega la
 * versió nova tot sol; si la porta depengués d'una memòria cau omplerta en
 * entrar a la zona de junta, després d'un desplegament ningú no l'hauria tornat
 * a omplir, i a la porta de la casa rural, sense cobertura, l'escàner no
 * obriria. La precache és atòmica: o hi és tota la versió, o no se n'instal·la
 * cap. La porta pesa poc i no pot dependre de res més.
 *
 * Tot plegat es decideix sobre el graf del build, amb els camins dels mòduls, i
 * no amb noms de tros ni amb hashos: el nom no diu qui l'importa. Es va
 * descartar agrupar la zona en trossos amb nom propi (`manualChunks`): desfeia
 * la partició pantalla per pantalla que fa `App.tsx`, i el nom continuaria sense
 * dir si l'Inici en depèn. Si demà una pantalla de soci passa a `lazy()`, es
 * queda a la precache igual que si no ho fos.
 *
 * ELS IDIOMES: només hi va el que porta l'entrada, el català. El castellà i
 * l'anglès són trossos propis (`src/i18n/index.ts`), uns 31 KiB gzip cadascun,
 * i cada persona en llegeix un o cap. A la precache eren 62 KiB de cada
 * instal·lació que gairebé ningú no feia servir.
 *
 * Al principi s'hi van quedar, perquè un idioma triat que no és al telèfon és
 * una pantalla que, sense xarxa, surt en un altre idioma. El que ho resol sense
 * la precache és que el tros es desi la primera vegada que es llegeix:
 *
 *   - Qui obre l'app en castellà el baixa en arrencar, amb xarxa, i la regla
 *     `chunks` (`vite.config.ts`) el desa. Si la primera visita l'ha baixat abans
 *     que el service worker hi manés, `src/lib/firstControl.ts` el torna a
 *     demanar quan hi mana, i aleshores es desa.
 *   - Qui el canvia al perfil el baixa en aquell moment, i es desa igual.
 *   - El nom del tros només canvia quan canvia el fitxer de l'idioma. Si un
 *     desplegament el canvia, `autoUpdate` recarrega la pàgina en activar-se el
 *     service worker nou, que s'acaba d'instal·lar amb xarxa, i la pàgina nova
 *     demana el tros nou de seguida.
 *
 * El que es perd: triar al perfil, sense cobertura, un idioma que el telèfon
 * no té desat. Surt l'idioma de reserva, en lloc de quedar-se en blanc
 * (`src/i18n/backend.ts`), i el triat surt la primera vegada que hi ha xarxa. Es va considerar baixar els dos idiomes en segon pla després
 * d'instal·lar: és el mateix pes que tenir-los a la precache, només que més tard.
 *
 * El que surt d'aquí no es perd: el guarda una memòria cau `CacheFirst` la
 * primera vegada que es demana (`vite.config.ts`), i la zona de junta en demana
 * una part per avançat en entrar-hi (`features/door/preload.ts`).
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

/** La part de la zona que s'ha d'obrir sense xarxa, i el camí per arribar-hi. */
const DOOR = [
  /\/src\/features\/door\//,
  /\/node_modules\/barcode-detector\//,
  /\/node_modules\/zxing-wasm\//,
  /\/src\/features\/junta\/GimcanaValidateScreen\.tsx$/,
  /\/src\/features\/junta\/JuntaHome\.tsx$/,
  // El marc de la zona, ara també un tros a demanda: sense ell no es pinta ni
  // el rebedor. No és de la junta pel camí, i la regla general ja el deixaria,
  // però és la porta d'entrada a la porta i no ha de dependre d'aquest detall.
  /\/src\/features\/shell\/JuntaLayout\.tsx$/,
]

const normal = (id: string) => id.replaceAll('\\', '/')

export function isJuntaModule(id: string): boolean {
  return JUNTA_ZONE.some((zone) => zone.test(normal(id)))
}

export function isDoorModule(id: string): boolean {
  return DOOR.some((door) => door.test(normal(id)))
}

/** Un fitxer d'idioma. El que l'entrada importa ja hi va dins, sigui quin sigui. */
export function isLocaleModule(id: string): boolean {
  return /\/src\/i18n\/locales\/[^/]+\.json$/.test(normal(id))
}

/** `\0` és un mòdul virtual —el runtime de rolldown, l'ajudant de precàrrega de
 * Vite—: no és de ningú, i no decideix res. */
const realModules = (chunk: Chunk) => chunk.moduleIds.filter((id) => !id.startsWith('\0'))

const onlyOf = (chunk: Chunk, belongs: (id: string) => boolean) => {
  const real = realModules(chunk)
  return real.length > 0 && real.every(belongs)
}

/** Si un tros és només de la junta: si en té algun de real i tots ho són. */
export function isJuntaOnly(chunk: Chunk): boolean {
  return onlyOf(chunk, isJuntaModule)
}

/** Si un tros és només un idioma, que és com surt un `import()` d'un JSON. */
export function isLocaleOnly(chunk: Chunk): boolean {
  return onlyOf(chunk, isLocaleModule)
}

/** Els fitxers que arrosseguen `roots`: ells i el que importen, fins al final. */
export function closure(
  bundle: Readonly<Record<string, BundleItem>>,
  roots: Iterable<string>,
): Set<string> {
  const seen = new Set<string>()
  const pending = [...roots]
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

const chunksOf = (bundle: Readonly<Record<string, BundleItem>>) =>
  Object.values(bundle).filter((item): item is Chunk => item.type === 'chunk')

/** El que es carrega sense cap `import()`: l'entrada i tot el que importa. */
export function staticClosure(bundle: Readonly<Record<string, BundleItem>>): Set<string> {
  return closure(
    bundle,
    chunksOf(bundle)
      .filter((chunk) => chunk.isEntry)
      .map((chunk) => chunk.fileName),
  )
}

/** El que es queda a la precache, d'entre els trossos i els seus fulls d'estil. */
export function keptFiles(bundle: Readonly<Record<string, BundleItem>>): Set<string> {
  const roots = chunksOf(bundle)
    .filter(
      (chunk) =>
        chunk.isEntry ||
        chunk.moduleIds.some(isDoorModule) ||
        !(isJuntaOnly(chunk) || isLocaleOnly(chunk)),
    )
    .map((chunk) => chunk.fileName)
  return closure(bundle, roots)
}

/** Els fitxers que no han d'anar a la precache. */
export function leftOutFiles(bundle: Readonly<Record<string, BundleItem>>): Set<string> {
  const kept = keptFiles(bundle)
  const out = new Set<string>()
  for (const chunk of chunksOf(bundle)) {
    if (kept.has(chunk.fileName)) continue
    out.add(chunk.fileName)
    for (const css of chunk.viteMetadata?.importedCss ?? []) if (!kept.has(css)) out.add(css)
  }
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
export function trimPrecache() {
  let excluded = new Set<string>()
  return {
    plugin: {
      name: 'app-comi:precache',
      apply: 'build' as const,
      generateBundle(_options: unknown, bundle: Record<string, BundleItem>) {
        excluded = leftOutFiles(bundle)
      },
    },
    manifestTransform: <T extends { readonly url: string }>(entries: T[]) => ({
      manifest: entries.filter((entry) => !excluded.has(entry.url)),
      warnings: [] as string[],
    }),
  }
}

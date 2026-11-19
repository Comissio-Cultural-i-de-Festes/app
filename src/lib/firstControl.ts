/**
 * El que la primera visita baixa abans que el service worker hi mani.
 *
 * El castellà i l'anglès no són a la precache (`build/precache.ts`): els desa
 * la regla `chunks` la primera vegada que passen pel service worker. Però a la
 * primera visita no hi passen. La pàgina demana l'idioma en arrencar, i el
 * service worker encara s'està instal·lant: fins que no l'ha acabat i reclama
 * la pàgina (`clientsClaim`), les peticions van directes a la xarxa i no queda
 * res desat. Qui instal·la l'app en castellà a la casa rural i l'obre l'endemà
 * sense cobertura la veuria en català.
 *
 * Per això, quan el service worker passa a manar, es torna a demanar tot el que
 * la pàgina ha carregat de `/assets/` fins aleshores. El que és a la precache
 * surt d'allà; la resta passa per la regla `chunks` i s'hi queda. Porten hash i
 * `immutable` (`public/_headers`), o sigui que normalment ni tan sols surten de
 * la memòria cau del navegador.
 *
 * Es va descartar demanar només l'idioma: el nom del tros porta un hash que la
 * pàgina no coneix, i treure'l del graf del build volia un connector més per a
 * un sol fitxer. La llista de la pàgina ja el porta, i de passada desa també
 * qualsevol altra pantalla que s'hagi obert abans d'hora.
 *
 * EL QUE ENCARA ESTÀ EN CAMÍ. Amb mala cobertura, el castellà pot haver sortit
 * abans que el service worker prengués el control i arribar després. Aquella
 * petició ja no passa per ell, i a la llista del moment del control encara no
 * hi és. Per això, a partir d'aleshores, s'escolten els recursos que van
 * acabant, i es torna a demanar el que va començar abans del control. El que
 * comença després ja hi passa sol, i no cal tornar-ho a demanar.
 *
 * Només la primera vegada. Quan el service worker ja hi mana tot hi passa sol,
 * i quan un de nou el substitueix `autoUpdate` recarrega la pàgina.
 */

/** Prou d'una entrada de `PerformanceResourceTiming`. */
export interface Resource {
  readonly name: string
  /** En el rellotge de `performance.now()`. */
  readonly startTime: number
}

/** El mateix criteri que la regla `chunks` de `vite.config.ts`. */
export function assetsToKeep(urls: Iterable<string>, origin: string): string[] {
  const keep = new Set<string>()
  for (const raw of urls) {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      continue
    }
    if (
      url.origin === origin &&
      url.pathname.startsWith('/assets/') &&
      /\.(?:js|css)$/.test(url.pathname)
    ) {
      keep.add(raw)
    }
  }
  return [...keep]
}

export interface FirstControl {
  /** `navigator.serviceWorker`, o el que en faci el paper a les proves. */
  readonly container: {
    readonly controller: object | null
    addEventListener(
      type: 'controllerchange',
      listener: () => void,
      options: AddEventListenerOptions,
    ): void
  }
  /** Els recursos que la pàgina ha acabat de carregar fins ara. */
  readonly loaded: () => readonly Resource[]
  /** Els que acabin d'aquí endavant, a mesura que acaben. */
  readonly later: (listener: (entries: readonly Resource[]) => void) => void
  readonly now: () => number
  readonly origin: string
  readonly fetch: (url: string) => Promise<unknown>
}

export function keepWhatCameFirst({
  container,
  loaded,
  later,
  now,
  origin,
  fetch,
}: FirstControl): void {
  if (container.controller !== null) return
  container.addEventListener(
    'controllerchange',
    () => {
      const control = now()
      const asked = new Set<string>()
      const ask = (entries: readonly Resource[]) => {
        const before = entries.filter((entry) => entry.startTime < control)
        const urls = assetsToKeep(
          before.map((entry) => entry.name),
          origin,
        )
        for (const url of urls) {
          if (asked.has(url)) continue
          asked.add(url)
          // Una fallada no es diu enlloc: la propera visita amb xarxa el desa.
          fetch(url).catch(() => undefined)
        }
      }
      ask(loaded())
      later(ask)
    },
    { once: true },
  )
}

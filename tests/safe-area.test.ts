import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * El coixí de dalt no pot dependre del mode de la barra d'estat.
 *
 * `index.html` tria `apple-mobile-web-app-status-bar-style: black`, i en aquest
 * mode iOS reserva la barra i `env(safe-area-inset-top)` val 0. O sigui que
 * `--ds-safe-top` a pèl és zero coixí a l'app instal·lada: el rellotge cau
 * sobre el logotip i l'avatar. Va costar una sessió amb un iPhone a la mà
 * trobar-ho, i l'arreglament va ser posar un terra a dinou llocs.
 *
 * Dinou llocs són una convenció, i una convenció dura fins que algú escriu la
 * pantalla vint. Això és el que la converteix en contracte: qui vulgui el valor
 * cru l'ha d'embolcallar en `max()` o fer servir `--ds-safe-top-min`, que ja el
 * porta. Cap de les dues coses impedeix una excepció deliberada —hi ha casos
 * que volen enganxar-se al vidre— però totes dues obliguen a dir-ho.
 */

const SOURCES = globSync('src/**/*.tsx').filter((f) => !f.includes('.test.'))

/**
 * Els comentaris no són codi.
 *
 * `InstallScreen` explica dins d'un comentari com era abans la seva pròpia
 * capçalera, i hi surt el patró que aquest test persegueix. Un test que llegeix
 * la documentació com si fos evidència és el mateix error en l'altre sentit.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** `--ds-safe-top` que no és `--ds-safe-top-min`. */
const RAW_TOKEN = /--ds-safe-top(?!-min)/

interface Use {
  readonly file: string
  readonly line: number
  readonly text: string
}

function collect(): { raw: Use[]; floored: Use[] } {
  const raw: Use[] = []
  const floored: Use[] = []
  for (const file of SOURCES) {
    const source = stripComments(readFileSync(file, 'utf8'))
    source.split('\n').forEach((text, i) => {
      const use = { file, line: i + 1, text: text.trim() }
      if (text.includes('--ds-safe-top-min')) floored.push(use)
      else if (RAW_TOKEN.test(text)) (text.includes('max(') ? floored : raw).push(use)
    })
  }
  return { raw, floored }
}

describe('el safe-area de dalt', () => {
  const { raw, floored } = collect()

  it('es fa servir en algun lloc, perquè un test que no troba res passa per no mirar', () => {
    // Sense això, el dia que el token es digui d'una altra manera el fitxer
    // sencer passa en va, que és com acaben tots els tests que escanegen codi.
    expect(floored.length).toBeGreaterThan(10)
  })

  it('no es fa servir mai cru sense un terra', () => {
    expect(
      raw.map((u) => `${u.file}:${String(u.line)} — ${u.text}`),
      'fes servir --ds-safe-top-min, o embolcalla --ds-safe-top en max(…, 12px)',
    ).toEqual([])
  })
})

/**
 * I la franja de dalt s'ha de tapar, no només encoixinar.
 *
 * El coixí de dalt resol el repòs. `viewport-fit=cover` fa que la vista
 * s'estengui per sota de la barra d'estat, o sigui que **en fer scroll** el
 * contingut puja i passa per darrere del rellotge i la bateria. L'Inici i el
 * Rànquing no ho van patir mai per casualitat —tenen la capçalera `sticky` amb
 * `bg-app`— i Idees ho patia: el títol es barrejava amb el rellotge.
 *
 * Només es veu amb un iPhone a la mà i fent scroll, i per això va arribar a
 * producció. Això és el que el converteix en el mateix cas que el token de
 * dalt: una regla que ningú no pot comprovar mirant la pantalla al portàtil
 * s'ha d'escriure aquí.
 *
 * Tres maneres de complir-ho, i totes tres tapen la franja de debò:
 * `<SafeTop />`, una capçalera `sticky` a `--ds-sticky-top`, o `JuntaHeader`,
 * que ja és tots dos.
 */
describe('la franja de la barra d’estat', () => {
  /**
   * L'excepció, dita en veu alta com el bloc de dalt demana.
   *
   * `QrScreen` centra un quadrat i no fa scroll mai: no hi ha contingut que
   * pugui pujar per darrere de res. Enganxar-hi una franja li mouria el QR sis
   * píxels amunt per a resoldre un problema que no té.
   */
  const DELIBERADES = ['src/features/qr/QrScreen.tsx']

  const cobreix = (source: string) =>
    source.includes('<SafeTop') ||
    source.includes('sticky top-[var(--ds-sticky-top)]') ||
    source.includes('<JuntaHeader')

  it('la tapa a cada pantalla amb barra de pestanyes', () => {
    const nues = SOURCES.filter((file) => {
      const ruta = file.split(/[\\/]/).join('/')
      // Pantalles i prou. `TabBar` anomena la classe al comentari que explica
      // què fa, i no és una pantalla ni té res a tapar.
      if (!ruta.endsWith('Screen.tsx')) return false
      if (DELIBERADES.some((d) => ruta.endsWith(d))) return false

      const source = stripComments(readFileSync(file, 'utf8'))
      if (!source.includes('with-tabbar')) return false
      return !cobreix(source)
    })

    expect(
      nues,
      `Aquestes pantalles deixen el contingut passar per darrere del rellotge en fer scroll. ` +
        `Posa-hi <SafeTop /> com a primer fill del <main>, o una capçalera sticky a ` +
        `--ds-sticky-top:\n${nues.join('\n')}`,
    ).toEqual([])
  })
})

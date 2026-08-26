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

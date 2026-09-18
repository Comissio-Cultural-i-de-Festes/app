import { readFileSync, globSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import ca from '@/i18n/locales/ca.json'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'

/**
 * Les tres llistes de motius no es poden desincronitzar, i ara importa més.
 *
 * AQUESTA PROVA ÉS VERDA I ÉS UNA REIXA, no la demostració de cap error
 * d'avui. Es deixa escrita perquè la feina de la issue #2 ha canviat què passa
 * quan es desincronitzen: fins ara la porta dibuixava una llista escrita a
 * `PointsScreen.tsx`, i una fila nova a `point_values` no es veia enlloc; des
 * de `motives.ts`, els botons SURTEN de la taula. Ho he comprovat al navegador
 * amb l'escala interceptada: una fila `{clau:'cartells'}` de més dibuixa un
 * quart botó tota sola, sense tocar cap línia de codi.
 *
 * Això és el que la issue volia —afegir un motiu ja no demana un desplegament—
 * i alhora obre el cas que la migració 25 descriu paraula per paraula: «un botó
 * que existeix, fa patxoca, i peta amb una violació de constraint al moment que
 * algú el prem davant d'una cua». La 25 tanca el camí per la interfície
 * (`admin_set_point_value` no insereix, i `authenticated` no té INSERT sobre
 * `point_values`: ho he provat, P0002 i 42501). El camí que queda obert és una
 * MIGRACIÓ que afegeixi la fila i es descuidi les altres dues llistes, i d'això
 * no en guardava res.
 *
 * Les tres, tal com les enumera la issue #2:
 *
 *   files de point_values     quins botons es DIBUIXEN  ← el que es llegeix aquí
 *   allowlist d'award_points  què es pot CREAR
 *   CHECK de points_log       què pot EXISTIR
 *
 * I la quarta llista, que no és de la base: l'etiqueta. El botó es pinta amb
 * ``t(`motive.${clau}`)``, o sigui que una clau sense traducció surt a la
 * pantalla com a «motive.cartells». També ho he vist al navegador.
 *
 * ES LLEGEIX DE LES MIGRACIONS I NO DE LA BASE, com `award-points-allowlist`:
 * el que es desplega és el repositori, i una base local on algú ja ha aplicat
 * coses a mà passaria verda dient una altra cosa.
 */

const MIGRATIONS = globSync('supabase/migrations/*.sql').sort()

function migrationsText(): string {
  return MIGRATIONS.map((f) => readFileSync(f, 'utf8')).join('\n')
}

/** L'última migració que reescriu la funció mana sobre les anteriors. */
function lastBodyOf(fn: string): string {
  const hits = MIGRATIONS.filter((f) =>
    new RegExp(`create or replace function public\\.${fn}\\b`).test(readFileSync(f, 'utf8')),
  )
  const file = hits.at(-1)
  if (file === undefined) throw new Error(`cap migració defineix ${fn}`)
  return readFileSync(file, 'utf8')
}

/**
 * Els motius que el repositori deixa a `point_values` un cop passades totes
 * les migracions: els `insert` de la llavor menys el que alguna migració
 * posterior esborri. `conduir` hi entra a la 15 i en surt a la 71, i el que
 * ha de quedar són els tres botons que la porta dibuixa.
 */
function motiusDeLEscala(): readonly string[] {
  const text = migrationsText()
  const posats = new Set<string>()
  // La xifra del final és el que separa una FILA —`('motiu', 'montaje', 20, 1)`—
  // del CHECK de la columna, que és `mena in ('motiu', 'tipus_esdeveniment')` i
  // encaixaria igual de bé amb un patró que només mirés les dues cometes.
  for (const m of text.matchAll(/\('motiu',\s*'([a-z_]+)',\s*\d+/g)) posats.add(m[1] ?? '')
  for (const m of text.matchAll(/delete from public\.point_values[^;]*clau\s*=\s*'([a-z_]+)'/g)) {
    posats.delete(m[1] ?? '')
  }
  return [...posats]
}

function allowlistDAwardPoints(): readonly string[] {
  const body = lastBodyOf('award_points')
  const llista = /p_motivo not in \(([^)]*)\)/.exec(body)?.[1] ?? ''
  return [...llista.matchAll(/'([a-z_]+)'/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
}

function checkDePointsLog(): readonly string[] {
  const touching = MIGRATIONS.filter((f) =>
    /points_log_motivo_check|motivo\s+text\s/.test(readFileSync(f, 'utf8')),
  )
  const last = touching.at(-1)
  if (last === undefined) throw new Error('cap migració defineix el CHECK de motivo')
  const body = readFileSync(last, 'utf8')
  const llista = /motivo[^;]*?in \(([^)]*)\)/.exec(body)?.[1] ?? ''
  return [...llista.matchAll(/'([a-z_]+)'/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
}

describe('les tres llistes de motius, i l’etiqueta', () => {
  it('l’escala només té els tres botons que la issue #2 hi deixa', () => {
    expect([...motiusDeLEscala()].sort()).toEqual(['montaje', 'propuso', 'trajo_gente'])
  })

  it('tot botó de l’escala es pot donar: cap fila fora de l’allowlist', () => {
    const allowlist = allowlistDAwardPoints()
    const orfes = motiusDeLEscala().filter((clau) => !allowlist.includes(clau))
    expect(
      orfes,
      'una fila a point_values sense entrada a l’allowlist dibuixa un botó que peta amb 22023',
    ).toEqual([])
  })

  it('i tot el que es pot donar pot existir: l’allowlist cap dins del CHECK', () => {
    const check = checkDePointsLog()
    const forats = allowlistDAwardPoints().filter((clau) => !check.includes(clau))
    expect(forats, 'award_points acceptaria un motiu que points_log rebutjaria').toEqual([])
  })

  it('cada botó de l’escala té etiqueta als tres idiomes', () => {
    for (const clau of motiusDeLEscala()) {
      for (const [nom, loc] of [
        ['ca', ca],
        ['es', es],
        ['en', en],
      ] as const) {
        const motius = (loc as { motive: Record<string, string> }).motive
        expect(
          motius[clau],
          `falta motive.${clau} a ${nom}.json: el botó sortiria amb la clau crua`,
        ).toBeTruthy()
      }
    }
  })

  it('i l’històric conserva la seva, encara que ja no sigui cap botó', () => {
    // `conduir` no és a l'escala des de la 71 i no es pot crear des de la 76,
    // però hi ha files de desembre al llibre major i el perfil les pinta amb
    // ``t(`motive.${row.motivo}`)``. Treure la clau les deixaria en majúscules.
    for (const [nom, loc] of [
      ['ca', ca],
      ['es', es],
      ['en', en],
    ] as const) {
      const motius = (loc as { motive: Record<string, string> }).motive
      expect(motius.conduir, `falta motive.conduir a ${nom}.json`).toBeTruthy()
    }
    expect(checkDePointsLog()).toContain('conduir')
  })
})

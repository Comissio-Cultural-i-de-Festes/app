import { readFileSync, globSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * El que `award_points` deixa CREAR, llegit de les migracions i no de la base.
 *
 * PER QUÈ NO ÉS UN pgTAP. El fitxer 480 prova la funció que hi ha a la base
 * connectada, i això no diu res de les migracions que el repositori es porta:
 * un stack local on algú ja va aplicar la migració a mà passa igual de verd
 * amb el fitxer al repositori i sense. Això és exactament el que va passar
 * aquí —la base local tenia la 76 aplicada i el fitxer no era a la branca—, o
 * sigui que les dotze assercions del 480 passaven mentre el desplegament des
 * de la branca hauria deixat `conduir` viu.
 *
 * Aquesta prova mira el que es desplega: l'última migració que defineix
 * `award_points`. És la mateixa idea que `010_structure.test.sql` —una
 * invariant que no té cap comportament observable fins al dia que en té—, però
 * viscuda des del repositori, que és on la 76 es pot perdre en una fusió.
 *
 * La issue #2 demana tres llistes i aquesta n'és una:
 *
 *   files de point_values     quins botons es dibuixen  → `conduir` FORA
 *   allowlist d'award_points  què es pot CREAR          → `conduir` FORA  ← aquí
 *   CHECK de points_log       què pot EXISTIR           → `conduir` HI ÉS
 *
 * La tercera també es comprova aquí, i en sentit contrari: retallar el CHECK
 * petaria el desplegament validant les files de desembre.
 */

const MIGRATIONS = globSync('supabase/migrations/*.sql').sort()

/** L'última migració que torna a escriure la funció mana sobre les anteriors. */
function lastDefinitionOf(fn: string): { file: string; body: string } {
  const hits = MIGRATIONS.filter((f) =>
    new RegExp(`create or replace function public\\.${fn}\\b`).test(readFileSync(f, 'utf8')),
  )
  const file = hits.at(-1)
  if (file === undefined) throw new Error(`cap migració defineix ${fn}`)
  return { file, body: readFileSync(file, 'utf8') }
}

describe("l'allowlist d'award_points, tal com es desplega", () => {
  it('no deixa crear `conduir`: és el motiu que la issue #2 retira', () => {
    const { file, body } = lastDefinitionOf('award_points')
    const allowlist = /p_motivo not in \(([^)]*)\)/.exec(body)?.[1] ?? ''
    expect(allowlist, `l'última definició és a ${file}`).not.toContain('conduir')
  })

  it('i sí `trajo_gente`, que és l’únic motiu de cotxe que queda', () => {
    const { body } = lastDefinitionOf('award_points')
    const allowlist = /p_motivo not in \(([^)]*)\)/.exec(body)?.[1] ?? ''
    expect(allowlist).toContain('trajo_gente')
  })

  it('sense perdre la nota obligatòria de `manual` que hi va posar la 72', () => {
    const { body } = lastDefinitionOf('award_points')
    expect(body).toMatch(/p_motivo = 'manual' and v_nota is null/)
  })

  it('ni la verja de restar, que continua sent de l’owner fora de `manual`', () => {
    const { body } = lastDefinitionOf('award_points')
    expect(body).toMatch(/p_puntos < 0 and p_motivo <> 'manual' and not private\.is_owner\(\)/)
  })

  it('i el CHECK de points_log continua acceptant `conduir`: l’històric no es reescriu', () => {
    const touching = MIGRATIONS.filter((f) => /points_log_motivo_check|motivo\s+text\s/.test(readFileSync(f, 'utf8')))
    const last = touching.at(-1)
    expect(last, 'cap migració defineix el CHECK de motivo').toBeDefined()
    expect(readFileSync(last as string, 'utf8')).toContain('conduir')
  })
})

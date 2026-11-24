import { existsSync, globSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Un camp que demana una amplada fixa no pot partir d'una constant que ja porta
 * `w-full`.
 *
 * Tailwind no resol el conflicte per l'ordre del `className` sinó per l'ordre
 * del full d'estils, i allà `.w-full` va després de totes les `.w-[Npx]`: la
 * fixa perd sempre, en silenci. A la gimcana això deixava el camp dels punts a
 * tota la fila, sortint per la dreta, i el títol de la prova reduït a un
 * quadradet buit. La classe hi era, el DOM era correcte i només els píxels ho
 * delataven, o sigui que es comprova aquí i no a ull.
 *
 * Es llegeix el codi font: una constant en majúscules que conté `w-full` (o
 * una altra constant que el contingui) no pot sortir en una plantilla al costat
 * d'una altra amplada. Les importades es resolen al fitxer d'on venen, perquè
 * hi ha més d'un `INPUT` al repositori i no tots fan el mateix.
 */

const SOURCES = globSync('src/**/*.tsx').map((f) => resolve(f))

const WIDTH = /(^|\s)(w-(?!full(\s|$))\S+)/

function constantsOf(source: string): Map<string, string> {
  const out = new Map<string, string>()
  const re =
    /(?:^|\n)(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*([\s\S]*?)(?=\n\s*\n|\n(?:export|const|function|type|import)\b)/g
  for (const m of source.matchAll(re)) out.set(m[1] ?? '', m[2] ?? '')
  return out
}

function importsOf(file: string, source: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const spec = m[2] ?? ''
    let base: string
    if (spec.startsWith('@/')) base = resolve('src', spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(file), spec)
    else continue
    const target = [`${base}.tsx`, `${base}.ts`].find((p) => existsSync(p))
    if (target === undefined) continue
    for (const name of (m[1] ?? '').split(',')) {
      const n = name.trim().replace(/^type\s+/, '')
      if (/^[A-Z][A-Z0-9_]*$/.test(n)) out.set(n, target)
    }
  }
  return out
}

const wideCache = new Map<string, Set<string>>()

/** Les constants d'un fitxer que acaben dient `w-full`, directament o no. */
function wideIn(file: string): Set<string> {
  const cached = wideCache.get(file)
  if (cached !== undefined) return cached
  const wide = new Set<string>()
  wideCache.set(file, wide)
  const source = readFileSync(file, 'utf8')
  const consts = constantsOf(source)
  const imported = importsOf(file, source)
  const isWide = (name: string, seen: Set<string>): boolean => {
    if (seen.has(name)) return false
    seen.add(name)
    const body = consts.get(name)
    if (body === undefined) {
      const from = imported.get(name)
      return from !== undefined && wideIn(from).has(name)
    }
    if (/(^|[\s'`])w-full(\s|$|['`])/.test(body)) return true
    return [...body.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].some((r) => isWide(r[1] ?? '', seen))
  }
  for (const name of [...consts.keys(), ...imported.keys()]) {
    if (isWide(name, new Set())) wide.add(name)
  }
  return wide
}

function conflicts(): string[] {
  const found: string[] = []
  for (const file of SOURCES) {
    const source = readFileSync(file, 'utf8')
    const wide = wideIn(file)
    if (wide.size === 0) continue
    for (const m of source.matchAll(/`([^`]*)`/g)) {
      const text = m[1] ?? ''
      const refs = [...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map((r) => r[1] ?? '')
      const base = refs.find((r) => wide.has(r))
      if (base === undefined) continue
      const own = text.replace(/\$\{[^}]*\}/g, ' ')
      const width = WIDTH.exec(own)?.[2]
      if (width === undefined) continue
      const line = source.slice(0, m.index).split('\n').length
      const where = relative('.', file).replaceAll('\\', '/')
      found.push(`${where}:${String(line)}  ${base} + ${width}`)
    }
  }
  return found
}

describe('amplades fixes sobre una constant amb w-full', () => {
  it('cap camp no hi afegeix una amplada que el full d’estils faria perdre', () => {
    expect(
      conflicts(),
      'Aquestes amplades no s’apliquen: `.w-full` va després al full d’estils i guanya.',
    ).toEqual([])
  })

  it('el detector veu el cas que ha passat de debò', () => {
    const file = resolve('src/features/junta/formBits.tsx')
    expect(wideIn(file).has('INPUT')).toBe(true)
  })
})

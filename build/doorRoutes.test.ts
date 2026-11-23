// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { isDoorModule } from './precache'

/**
 * Les rutes de la porta, les mateixes a tots tres llocs.
 *
 * Llegit del codi i no d'una llista: `App.tsx` diu quina pantalla va a cada
 * ruta, `build/precache.ts` quins mòduls són de la porta, i
 * `src/features/shell/doorRoutes.ts` quines rutes no esperen els textos de la
 * junta. Una pantalla nova de la porta, o una que deixa de ser-ho, ha de fer
 * fallar alguna cosa. El perquè, a `doorRoutes.ts`.
 */

const app = readFileSync('src/App.tsx', 'utf8')

/**
 * La llista, llegida del fitxer: aquest projecte de TypeScript no compila res
 * de `src/`, i no el pot importar.
 */
const DOOR_ROUTES = [
  ...(
    /DOOR_ROUTES = \[([^\]]*)\]/.exec(
      readFileSync('src/features/shell/doorRoutes.ts', 'utf8'),
    )?.[1] ?? ''
  ).matchAll(/'([^']+)'/g),
].map((m) => m[1])

/** De cada component carregat amb `lazy()`, el mòdul que importa. */
function modules(): Map<string, string> {
  const loaders = new Map(
    [...app.matchAll(/const (\w+) = \(\) => import\('([^']+)'\)/g)].map((m) => [m[1], m[2]]),
  )
  const found = new Map<string, string>()
  for (const m of app.matchAll(
    /const (\w+) = lazy\(\(\) =>\s*(?:import\('([^']+)'\)|(\w+)\(\))/g,
  )) {
    const spec = m[2] ?? loaders.get(m[3] ?? '')
    if (m[1] !== undefined && spec !== undefined) found.set(m[1], spec)
  }
  return found
}

/** Les rutes de dins de `/junta`, amb el component que pinten. */
function juntaRoutes(): { path: string; component: string }[] {
  const start = app.indexOf('path="/junta"')
  const block = app.slice(start, app.indexOf('</Route>', start))
  return [
    ...block.matchAll(/<Route\s+(?:index|path="([^"]+)")\s+element=\{<(\w+)\s*\/>\}\s*\/>/g),
  ].map((m) => ({
    path: m[1] === undefined ? '/junta' : `/junta/${m[1]}`,
    component: m[2] ?? '',
  }))
}

const fileOf = (spec: string) => `/app/${spec.replace(/^@\//, 'src/')}.tsx`

describe('the door routes', () => {
  const lazy = modules()
  const routes = juntaRoutes()

  it('finds the junta routes and what each one loads', () => {
    expect(routes.length).toBeGreaterThan(20)
    for (const { path, component } of routes) {
      expect(lazy.get(component), `${path}: no lazy() import for ${component}`).toBeDefined()
    }
  })

  it('are exactly the junta routes whose screen is a door module', () => {
    const door = routes
      .filter(({ component }) => isDoorModule(fileOf(lazy.get(component) ?? '')))
      .map(({ path }) => path)

    expect(door.length).toBeGreaterThanOrEqual(5)
    expect([...door].sort()).toEqual([...DOOR_ROUTES].sort())
  })
})

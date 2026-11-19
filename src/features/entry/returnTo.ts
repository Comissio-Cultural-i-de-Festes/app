/**
 * La fitxa on volia anar qui ha obert un enllaç sense haver entrat.
 *
 * La difusió és per enllaços enganxats al grup, i el camí de Google passa per
 * dos orígens i torna a `/`: sense això, qui obria la fitxa d'un esdeveniment
 * aterrava a l'Inici sense cap rastre d'on venia. No es toca el `redirectTo`
 * ni la llista d'URLs que accepta Supabase; la ruta es deixa aquí abans
 * d'anar-se'n i es recull en tornar.
 *
 * `localStorage` i no `sessionStorage`: a iOS el retorn de Google pot obrir-se
 * en una pestanya nova de Safari, que comparteix el primer però no el segon.
 * Allà on el retorn va a una altra banda —la icona instal·lada té el seu propi
 * magatzem— no hi ha res a recollir, i és el límit: no es pot arreglar des
 * d'aquí.
 *
 * El que es llegeix d'aquí acaba en una navegació, o sigui que es valida tant
 * en escriure com en llegir: qualsevol altra pestanya del mateix origen hi pot
 * haver deixat el que sigui. Només rutes internes sota un conjunt de prefixos,
 * sense query ni fragment (el `?codi=` té el seu propi camí) i sense res que
 * un navegador pugui interpretar com un altre origen. I caduca aviat: un
 * enllaç d'ara fa setmanes no ha de tornar a aparèixer.
 */

const KEY = 'comi.return.to'
const MAX_AGE_MS = 15 * 60 * 1000

/** Llista tancada: afegir-hi una ruta és una decisió, no un descuit. */
const ALLOWED_PREFIXES = ['/esdeveniment/'] as const

const SAFE_PATH = /^\/[A-Za-z0-9._~\-/]+$/

export function isReturnPath(path: string): boolean {
  if (!SAFE_PATH.test(path)) return false
  if (path.startsWith('//') || path.includes('//')) return false
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix) && path.length > prefix.length)
}

function clear(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Una ruta que no es pot recordar també esborra la d'abans: no n'hi ha de velles. */
export function rememberReturn(path: string, now = Date.now()): void {
  if (!isReturnPath(path)) {
    clear()
    return
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: now }))
  } catch {
    // Emmagatzematge bloquejat: tornem a l'Inici, com abans.
  }
}

/** De un sol ús: es llegeix i s'esborra, valgui o no. */
export function takeReturn(now = Date.now()): string | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  clear()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { path, at } = parsed as { path?: unknown; at?: unknown }
  if (typeof path !== 'string' || typeof at !== 'number') return null
  const age = now - at
  if (age < 0 || age > MAX_AGE_MS) return null
  return isReturnPath(path) ? path : null
}

/** Per quan ja s'ha entrat per una altra banda i el que hi havia ja no toca. */
export function forgetReturn(): void {
  clear()
}

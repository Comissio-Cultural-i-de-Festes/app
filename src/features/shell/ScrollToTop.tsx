import { useEffect, useLayoutEffect, useRef } from 'react'
import { NavigationType, useLocation, useNavigationType } from 'react-router'

/**
 * Cada pantalla nova s'obre a dalt, i tornar enrere et deixa on eres.
 *
 * `BrowserRouter` no és un data router, o sigui que no hi ha `ScrollRestoration`
 * i el navegador no sap res de pantalles: una fitxa oberta des d'una llista
 * s'obria a mig scroll, amb la portada i el títol per sobre.
 *
 * En tornar enrere (POP) la posició es restaura des del que s'ha guardat en
 * marxar, però l'Inici i les llistes pinten dades que arriben tard: es
 * reintenta uns instants fins que la pàgina és prou alta per arribar-hi, i es
 * deixa estar tan bon punt la persona toca res. Mentre dura el reintent no es
 * desa la posició, que seria la retallada.
 *
 * Les posicions van a `sessionStorage`: una recàrrega o una PWA reoberta
 * conserva l'historial i, amb `scrollRestoration` en manual, també ha de
 * conservar això.
 *
 * Un canvi només d'àncora no mou res, i un POP amb àncora tampoc: aleshores
 * mana l'àncora, que la pantalla resol quan té dades (`#soc-aqui`).
 */

const STORE = 'comi.scroll'
const RETRY_MS = 1500
const MAX_KEYS = 50
const INTERRUPT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

function read(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORE)
    return raw === null ? {} : (JSON.parse(raw) as Record<string, number>)
  } catch {
    return {}
  }
}

/**
 * Es guarden les últimes `MAX_KEYS` pantalles: l'emmagatzematge és petit i
 * una sessió llarga de navegació el podria omplir de claus que ja no es
 * tornaran a visitar. Una clau reescrita passa al final.
 */
const writtenHere = new Set<string>()

function remember(key: string, y: number) {
  writtenHere.add(key)
  const positions = read()
  delete positions[key]
  positions[key] = y
  const keys = Object.keys(positions)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_KEYS))) delete positions[old]
  write(positions)
}

/**
 * La clau `default` és la de la primera entrada de qualsevol document, o sigui
 * que n'hi pot haver una de guardada d'una pàgina que no és aquesta. Només es
 * restaura si l'ha escrita aquest mateix document (l'Inici sol ser la primera
 * entrada, i tornar-hi des d'una fitxa és el cas normal) o si el navegador diu
 * que és el mateix document tornant (recàrrega, PWA reoberta o enrere des de
 * fora).
 */
function sameDocument(key: string): boolean {
  if (key !== 'default' || writtenHere.has(key)) return true
  const entry = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  return entry?.type === 'reload' || entry?.type === 'back_forward'
}

function write(positions: Record<string, number>) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(positions))
  } catch {
    // Sense emmagatzematge es perd la posició, i no passa res més.
  }
}

export function ScrollToTop() {
  const { pathname, key, hash } = useLocation()
  const type = useNavigationType()
  const keyRef = useRef(key)
  const pathRef = useRef(pathname)
  const settling = useRef(false)

  const lastY = useRef(0)

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const track = () => {
      if (!settling.current) lastY.current = Math.round(window.scrollY)
    }
    const flush = () => remember(keyRef.current, lastY.current)
    const hidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('scroll', track, { passive: true })
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('scroll', track)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])

  useLayoutEffect(() => {
    const samePath = pathRef.current === pathname
    if (keyRef.current !== key) {
      remember(keyRef.current, lastY.current)
      lastY.current = Math.round(window.scrollY)
    }
    keyRef.current = key
    pathRef.current = pathname
    if (samePath && type !== NavigationType.Pop) return
    if (type === NavigationType.Pop && hash !== '') return

    const target = type === NavigationType.Pop && sameDocument(key) ? (read()[key] ?? 0) : 0
    window.scrollTo(0, target)
    lastY.current = target
    if (target === 0) return

    settling.current = true
    const until = Date.now() + RETRY_MS
    let frame = 0
    const release = () => {
      settling.current = false
      cancelAnimationFrame(frame)
      for (const name of INTERRUPT) window.removeEventListener(name, stop)
    }
    // Acabar el reintent (o ser interromput) és quan la posició torna a ser
    // la de la pantalla actual; marxar d'ella no, i per això `release` a part.
    const stop = () => {
      release()
      lastY.current = Math.round(window.scrollY)
    }
    const settle = () => {
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) > 1 && Date.now() < until) {
        frame = requestAnimationFrame(settle)
      } else {
        stop()
      }
    }
    for (const name of INTERRUPT) window.addEventListener(name, stop, { passive: true })
    frame = requestAnimationFrame(settle)
    return release
  }, [pathname, key, type, hash])

  return null
}

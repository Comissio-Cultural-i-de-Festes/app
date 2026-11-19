import { useEffect, useLayoutEffect, useRef } from 'react'
import { NavigationType, useLocation, useNavigationType } from 'react-router'

/**
 * Cada pantalla nova s'obre a dalt, i tornar enrere et deixa on eres.
 *
 * `BrowserRouter` no és un data router, o sigui que no hi ha `ScrollRestoration`
 * i el navegador no sap res de pantalles: una fitxa oberta des d'una llista
 * s'obria a mig scroll, amb la portada i el títol per sobre. I el mateix amb
 * l'Inici en acabar el primer cop.
 *
 * En tornar enrere (POP) la posició es restaura des del que s'ha guardat en
 * marxar, però l'Inici i les llistes pinten dades que arriben tard: es
 * reintenta uns instants fins que la pàgina és prou alta per arribar-hi.
 * Un canvi només d'àncora no mou res; les pantalles amb `#àncora` fan el seu
 * propi scroll quan tenen dades, i el d'aquí ja els ha deixat a dalt.
 */

const positions = new Map<string, number>()
const RETRY_MS = 1500

export function ScrollToTop() {
  const { pathname, key } = useLocation()
  const type = useNavigationType()
  const keyRef = useRef(key)
  const pathRef = useRef(pathname)

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const save = () => positions.set(keyRef.current, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])

  useLayoutEffect(() => {
    const samePath = pathRef.current === pathname
    keyRef.current = key
    pathRef.current = pathname
    if (samePath && type !== NavigationType.Pop) return

    const target = type === NavigationType.Pop ? (positions.get(key) ?? 0) : 0
    window.scrollTo(0, target)
    if (target === 0) return

    const until = Date.now() + RETRY_MS
    let frame = 0
    const settle = () => {
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) > 1 && Date.now() < until) {
        frame = requestAnimationFrame(settle)
      }
    }
    frame = requestAnimationFrame(settle)
    return () => cancelAnimationFrame(frame)
  }, [pathname, key, type])

  return null
}

import { useQuery } from '@tanstack/react-query'

import { AVATARS, signedUrls } from '@/lib/storage'

/**
 * Una URL signada per a un avatar, sense una petició per cara.
 *
 * PER QUÈ NO ÉS UN `useCovers` A CADA PANTALLA. Els avatars surten a vint-i-cinc
 * llocs de dinou fitxers: el rànquing, les cares de qui va a una festa,
 * l'escàner, els socis, els pagaments, els cotxes. Fer que cada pantalla
 * reculli els camins i els signi en bloc —el que fa `useCovers` amb les
 * portades— voldria tocar-los tots i deixar-ne un mig fet el dia que algú
 * afegeixi una llista nova. Aquí el component ho resol ell, i les crides es
 * junten a fora.
 *
 * COM ES JUNTEN. Cada `Avatar` demana el seu camí i cada camí té la seva
 * entrada a la memòria cau, que és el que fa que dues llistes amb la mateixa
 * gent no signin res dues vegades. El que no té una entrada per camí és la
 * petició: tots els que es demanen dins del mateix microtask entren en una
 * sola crida a `signedUrls`. Trenta cares a la pantalla del rànquing són una
 * petició, no trenta.
 *
 * I LA MAJORIA NO EN DEMANEN CAP. `avatar_url` guarda una URL absoluta de
 * Google per a tothom que no s'hagi canviat la foto, i aquelles no es signen:
 * la consulta ni s'activa. Això vol dir que aquest fitxer no fa res a l'app
 * fins que algú puja una foto, que és exactament el que ha de passar.
 *
 * Cinquanta minuts de `staleTime` perquè els enllaços duren una hora.
 */

const TTL_MS = 50 * 60 * 1000

/** Els camins demanats en aquest microtask, amb qui els espera. */
let batch: {
  readonly paths: string[]
  readonly waiting: Map<string, string | null>
  readonly ready: Promise<void>
} | null = null

function enqueue(path: string): Promise<string | null> {
  batch ??= (() => {
    const paths: string[] = []
    const waiting = new Map<string, string | null>()
    // El microtask: tot el que React demani en aquest mateix pas de render hi
    // cap, i la crida surt just després.
    const ready = Promise.resolve().then(async () => {
      batch = null
      const urls = await signedUrls(AVATARS, paths)
      for (const p of paths) waiting.set(p, urls.get(p) ?? null)
    })
    return { paths, waiting, ready }
  })()

  const mine = batch
  if (!mine.paths.includes(path)) mine.paths.push(path)

  return mine.ready.then(() => mine.waiting.get(path) ?? null)
}

/** Una URL absoluta ja és bona; un camí del bucket s'ha de signar. */
export function isStoragePath(src: string | null): src is string {
  return src !== null && src !== '' && !src.startsWith('http://') && !src.startsWith('https://')
}

export function useAvatarUrl(src: string | null): string | null {
  const path = isStoragePath(src) ? src : null

  const signed = useQuery({
    queryKey: ['avatar', path],
    queryFn: () => enqueue(path!),
    enabled: path !== null,
    staleTime: TTL_MS,
  })

  return path === null ? src : (signed.data ?? null)
}

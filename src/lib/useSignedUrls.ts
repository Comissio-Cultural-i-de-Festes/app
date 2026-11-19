import { type UseQueryResult, useQueries, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'

import { SIGNED_TTL_SECONDS, signedKey } from './signedQuery'
import { signedUrlQuery } from './storage'

/**
 * Les URL d'un grapat d'objectes d'un cubell, com un `Map` de camí a URL.
 *
 * Per sota és una consulta per camí (`signedUrlQuery`), i per això una foto
 * nova a la galeria només signa la nova. Per sobre és el mateix `Map` que ja
 * feien servir les pantalles, de manera que `urls.data.get(path)` no canvia.
 *
 * Una URL absoluta —la foto de Google d'un avatar, o una portada escrita a mà—
 * passa tal com és. Un camí que no té URL, o que encara no en té, no hi surt, i
 * la pantalla ja sap pintar una imatge que no hi és.
 *
 * NI UNA URL CADUCADA. El `gcTime` compta des que la consulta es deixa d'usar i
 * no des que es va signar, o sigui que una pantalla que torna a muntar-se pot
 * trobar a la memòria cau una URL de fa més d'una hora, i una que porta oberta
 * més d'una hora en té de pròpies que s'han fet velles. Aquí es tracten com si
 * no hi fossin, perquè una miniatura `lazy` no pinti la icona trencada.
 *
 * I ES TORNEN A DEMANAR AQUÍ. React Query només refresca una consulta vella en
 * muntar-la o en tornar al primer pla: una pantalla que no fa ni una cosa ni
 * l'altra —una galeria oberta tota la nit que rep una foto nova— deixaria les
 * miniatures ja carregades fora del que s'ensenya fins al pròxim focus. Un
 * efecte invalida les caducades, totes en el mateix pas perquè surtin en un sol
 * lot. Només s'hi torna quan canvia el conjunt de camins caducats, no a cada
 * render: si la nova firma falla, el mateix conjunt no torna a disparar res, i
 * el fallback és el de sempre (tornar a l'app).
 */

const TTL_MS = SIGNED_TTL_SECONDS * 1000

function isAbsolute(src: string): boolean {
  return src.startsWith('http://') || src.startsWith('https://')
}

interface Combined {
  readonly urls: Map<string, string>
  /** Camins amb una URL de més d'una hora, i per tant sense mostrar. */
  readonly expired: readonly string[]
  /** Quan caduca la primera de les que es mostren, o `null` si no n'hi ha. */
  readonly nextExpiry: number | null
}

export function useSignedUrls(
  bucket: string,
  paths: readonly (string | null)[],
): { readonly data: Map<string, string> } {
  const key = [...new Set(paths.filter((p): p is string => p !== null && p !== ''))].join('\n')

  const { stored, absolute } = useMemo(() => {
    const all = key === '' ? [] : key.split('\n')
    return { stored: all.filter((p) => !isAbsolute(p)), absolute: all.filter(isAbsolute) }
  }, [key])

  const combine = useCallback(
    (results: UseQueryResult<string | null>[]): Combined => {
      const urls = new Map<string, string>()
      for (const url of absolute) urls.set(url, url)
      const expired: string[] = []
      let nextExpiry: number | null = null
      const oldest = Date.now() - TTL_MS
      results.forEach((result, i) => {
        const path = stored[i]
        if (path === undefined || typeof result.data !== 'string') return
        if (result.dataUpdatedAt > oldest) {
          urls.set(path, result.data)
          const at = result.dataUpdatedAt + TTL_MS
          if (nextExpiry === null || at < nextExpiry) nextExpiry = at
        } else expired.push(path)
      })
      return { urls, expired, nextExpiry }
    },
    [stored, absolute],
  )

  const { urls, expired, nextExpiry } = useQueries({
    queries: stored.map((path) => signedUrlQuery(bucket, path)),
    combine,
  })

  const client = useQueryClient()
  const expiredKey = expired.join('\n')
  useEffect(() => {
    if (expiredKey === '') return
    const keys = new Set(expiredKey.split('\n'))
    // `cancelRefetch: false`: una que ja s'està demanant —la del muntatge— no
    // s'ha de cancel·lar per tornar-la a començar.
    void client.invalidateQueries(
      {
        predicate: ({ queryKey }) =>
          queryKey[1] === bucket && typeof queryKey[2] === 'string' && keys.has(queryKey[2]),
        queryKey: signedKey(bucket),
      },
      { cancelRefetch: false },
    )
  }, [client, bucket, expiredKey])

  // I SENSE RES QUE ES VOLTI. `combine` només es torna a avaluar quan canvia un
  // resultat o la llista, i una galeria oberta tota la nit sense cap de les
  // dues deixaria les URL fer l'hora sense que ningú se n'adonés. Un
  // temporitzador fins a la primera caducitat les renova; quan arriben les
  // noves, `nextExpiry` canvia i se'n arma un altre.
  useEffect(() => {
    if (nextExpiry === null) return
    const timer = setTimeout(
      () => {
        const oldest = Date.now() - TTL_MS
        const mine = new Set(stored)
        void client.invalidateQueries(
          {
            queryKey: signedKey(bucket),
            predicate: (query) =>
              typeof query.queryKey[2] === 'string' &&
              mine.has(query.queryKey[2]) &&
              query.state.dataUpdatedAt <= oldest,
          },
          { cancelRefetch: false },
        )
      },
      Math.max(0, nextExpiry - Date.now()),
    )
    return () => {
      clearTimeout(timer)
    }
  }, [client, bucket, stored, nextExpiry])

  return { data: urls }
}

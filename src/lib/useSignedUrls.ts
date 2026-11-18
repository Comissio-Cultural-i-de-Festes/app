import { type UseQueryResult, useQueries } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { SIGNED_TTL_SECONDS } from './signedQuery'
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
 * trobar a la memòria cau una URL de fa més d'una hora. Aquella consulta ja és
 * vella i es torna a demanar sola en muntar; mentrestant aquí es tracta com si
 * no hi fos, perquè una miniatura `lazy` no pinti la icona trencada.
 */

const TTL_MS = SIGNED_TTL_SECONDS * 1000

function isAbsolute(src: string): boolean {
  return src.startsWith('http://') || src.startsWith('https://')
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
    (results: UseQueryResult<string | null>[]) => {
      const out = new Map<string, string>()
      for (const url of absolute) out.set(url, url)
      const oldest = Date.now() - TTL_MS
      results.forEach((result, i) => {
        const path = stored[i]
        if (
          path !== undefined &&
          typeof result.data === 'string' &&
          result.dataUpdatedAt > oldest
        ) {
          out.set(path, result.data)
        }
      })
      return out
    },
    [stored, absolute],
  )

  const data = useQueries({
    queries: stored.map((path) => signedUrlQuery(bucket, path)),
    combine,
  })

  return { data }
}

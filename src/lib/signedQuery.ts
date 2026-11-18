import { type Query, type QueryClient, type QueryKey } from '@tanstack/react-query'

/**
 * Les URL signades a la memòria cau, i per què no es refresquen com la resta.
 *
 * Cada URL que torna Storage és nova encara que l'objecte sigui el mateix: el
 * testimoni porta la marca de temps. Per al navegador, una URL nova és una
 * imatge nova, i la baixa sencera. Quan tornar a l'app ho invalidava tot, cada
 * tornada eren totes les portades i totes les cares un altre cop: uns tretze
 * gigues al mes sobre una quota de cinc que, quan es passa, deixa tota l'API
 * responent amb error fins al mes següent.
 *
 * LA REGLA VIU A LA CLAU. Tota consulta que guarda URL signades comença per
 * `signedKey(…)`. D'aquí en surten les dues coses que la fan diferent:
 * `invalidateData` se la salta, i `withSignedDefaults` li posa els temps. Es
 * va descartar marcar-ho amb `meta` a cada `useQuery`: és igual d'explícit però
 * no es veu a la clau, i un `invalidateQueries({ queryKey })` d'un altre fitxer
 * no ho sabria. `tests/signed-url-keys.test.ts` vigila que ningú signi sense la
 * marca.
 *
 * ELS TEMPS. La firma dura una hora.
 *
 *   - `staleTime` de cinquanta minuts: abans que caduqui, la tornada al primer
 *     pla, la xarxa recuperada o un muntatge nou la tornen a signar. Els deu
 *     minuts que queden són perquè una URL entregada a l'últim moment encara
 *     tingui temps de baixar la imatge amb la cobertura d'una sala plena.
 *   - `gcTime` d'una hora, i no la mitja hora global: amb trenta minuts, sortir
 *     de l'inici per mirar una fitxa una estona llençava una URL encara vàlida i
 *     en tornar se'n signava una altra, que és una altra baixada. Més enllà
 *     d'una hora no val la pena guardar-la: segur que ha caducat.
 *
 * El que això no evita: el `gcTime` compta des que la consulta es deixa d'usar,
 * no des que es va signar, o sigui que una pantalla que torna a muntar-se amb
 * una URL de més d'una hora l'ensenya durant una volta morta mentre se'n signa
 * una altra (la URL vella és «stale» i es demana la nova en muntar). Una `<img>`
 * normal canvia sola quan arriba la nova; `Avatar` recorda l'error per URL i no
 * per sempre, que és el que fa que també es recuperi.
 */

const MINUTE = 60_000

/** Quant viu una URL signada. Una hora: més del que ningú mira una pantalla. */
export const SIGNED_TTL_SECONDS = 3600

const SIGNED = 'signed'

export function signedKey(bucket: string, ...paths: readonly string[]) {
  return [SIGNED, bucket, ...paths] as const
}

export function isSignedKey(key: QueryKey): boolean {
  return key[0] === SIGNED
}

/** Si una consulta s'ha de refrescar quan l'app torna o quan han canviat dades. */
export function revalidates(query: Query): boolean {
  return !isSignedKey(query.queryKey)
}

/**
 * «Refresca-ho tot», menys les URL signades.
 *
 * El que abans era un `invalidateQueries()` a seques. Les dades JSON —la
 * revelació d'un esdeveniment inclosa— s'invaliden igual que sempre; una URL
 * signada es refresca pels seus temps i prou. Si l'objecte canvia, el camí
 * canvia amb ell (portades, avatars i fotos porten la marca de temps al nom),
 * i un camí nou és una clau nova.
 */
export function invalidateData(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ predicate: revalidates })
}

export function withSignedDefaults(client: QueryClient): QueryClient {
  client.setQueryDefaults([SIGNED], {
    staleTime: 50 * MINUTE,
    gcTime: SIGNED_TTL_SECONDS * 1000,
  })
  return client
}

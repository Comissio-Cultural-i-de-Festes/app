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
 * LA REGLA VIU A LA CLAU. Tota consulta que guarda una URL signada és
 * `signedKey(cubell, camí)`, una per objecte, i només la construeix
 * `signedUrlQuery` de `storage.ts`, l'única porta per signar. D'aquí en surten
 * les dues coses que la fan diferent: `invalidateData` se la salta, i
 * `withSignedDefaults` li posa els temps. Es va descartar marcar-ho amb `meta`
 * a cada `useQuery`: és igual d'explícit però no es veu a la clau, i un
 * `invalidateQueries({ queryKey })` d'un altre fitxer no ho sabria.
 * `tests/signed-url-keys.test.ts` vigila les dreceres que el compilador no veu.
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
 * El que els temps sols no evitarien: el `gcTime` compta des que la consulta
 * es deixa d'usar, no des que es va signar, o sigui que una pantalla que torna
 * a muntar-se pot trobar una URL de més d'una hora. És vella i es torna a
 * demanar en muntar; mentrestant `useSignedUrls` no l'ensenya. I `Avatar`
 * recorda l'error per URL i no per sempre, per si n'arriba una de morta igual.
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

/**
 * Si una consulta s'ha de refrescar quan l'app torna o quan han canviat dades.
 *
 * Una entrada signada sense URL sí: o la firma no ha arribat, o el servidor no
 * l'ha volguda donar. El segon cas canvia quan canvia el que la RLS deixa
 * veure —una persona pendent que bescanvia un codi passa a poder veure les
 * portades—, i com que no hi havia cap URL, tornar-la a demanar no torna a
 * baixar cap imatge.
 */
export function revalidates(query: Query): boolean {
  return !isSignedKey(query.queryKey) || query.state.data == null
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
  // `predicate`, i no una llista de claus a excloure: la regla és la de
  // `revalidates`, la mateixa per a la tornada a l'app i per a qualsevol
  // mutació que ho vulgui refrescar tot.
  return client.invalidateQueries({ predicate: revalidates })
}

export function withSignedDefaults(client: QueryClient): QueryClient {
  client.setQueryDefaults([SIGNED], {
    staleTime: 50 * MINUTE,
    gcTime: SIGNED_TTL_SECONDS * 1000,
  })
  return client
}

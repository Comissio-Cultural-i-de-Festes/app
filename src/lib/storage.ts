import { queryOptions } from '@tanstack/react-query'

import { staleIn } from './prune'
import { SIGNED_TTL_SECONDS, signedKey } from './signedQuery'
import { SWEEP_BATCH, SWEEP_ROUNDS, byBucket } from './sweep'
import { supabase } from './supabase'

/**
 * Images, and why none of them have a plain URL.
 *
 * Both buckets are private. A "public" Supabase bucket is public to the whole
 * internet: the path is unguessable but unauthenticated, the link never
 * expires, and it keeps working long after somebody has left the association.
 * For a cover that is a spoiler nobody can recall — the poster belongs to an
 * event that may still be behind reveal_at. For a photograph taken at a door
 * it would be indefensible.
 *
 * So what is stored in the database is the object path, and a URL is minted on
 * read with an hour to live. An hour is longer than anybody looks at a screen
 * and shorter than a link is worth forwarding.
 */

export const COVERS = 'event-covers'
export const DOOR_PHOTOS = 'door-photos'
export const EVENT_PHOTOS = 'event-photos'
export const GIMCANA_PHOTOS = 'gimcana-photos'
export const AVATARS = 'avatars'

/** Longest edge, in pixels, of anything that goes up. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

/**
 * Shrinks a photo before it leaves the phone.
 *
 * A modern phone camera produces eight to twelve megabytes a frame. Uploading
 * that over the venue's wifi is a minute of somebody standing still, it blows
 * the bucket's five-megabyte ceiling, and nothing on a 430-pixel screen can
 * tell the difference. If anything goes wrong the original is used, because a
 * slow upload beats no cover.
 *
 * I SEMPRE PASSA PEL CANVAS, encara que no calgui encongir-la. Abans hi havia
 * un camí ràpid —si ja cabia i no calia escalar, es tornava el fitxer tal com
 * havia arribat— i aquell camí s'enduia les metadades EXIF amunt: un JPEG de
 * menys de dos megues fet amb el mòbil porta la marca del model i, si la
 * càmera té la ubicació encesa, **les coordenades d'on es va fer**. Els altres
 * tres cubells ja hi passaven sempre (`encodeJpeg` per a la galeria i la
 * gimcana, el canvas de la càmera per a la porta); els avatars i les portades
 * eren els dos que se saltaven la re-codificació, i són precisament els dos on
 * la foto surt del carret i no de la càmera de l'app.
 *
 * Re-codificar el que ja cabia costa unes dècimes de segon al telèfon i una
 * mica de qualitat. Val la pena: és l'única manera que «traiem les metadades»
 * sigui una frase certa i no «gairebé sempre».
 */
/**
 * El fitxer triat no és una imatge que aquest navegador sàpiga llegir.
 *
 * El cas real és un HEIC del carret d'un iPhone en un navegador que no el
 * descodifica. Abans això queia al `catch` de `shrinkImage` i tornava el
 * fitxer ORIGINAL, que se pujava sencer —dotze megues per la wifi de la sala—
 * i el rebutjava el servidor amb un 415. Aquí es para abans de sortir del
 * telèfon, i `errorKey()` en sap dir el motiu.
 */
export class UnreadableImage extends Error {
  constructor(cause: unknown) {
    super('the browser cannot decode this file as an image', { cause })
    this.name = 'UnreadableImage'
  }
}

export async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch (cause) {
    // Únic cas que és culpa del fitxer. Tot el que ve després pot fallar per
    // motius del navegador —sense canvas, sense codificador— i aleshores
    // tornar l'original és la degradació correcta.
    throw new UnreadableImage(cause)
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

    const canvas = document.createElement('canvas')
    // `Math.max(1, …)`, com a `encodeJpeg`: un retall panoràmic de 5000×1
    // arrodoneix el costat curt a zero, i un canvas de dimensió zero fa que
    // `toBlob` torni null. Llavors sortiríem per l'`?? file` de sota amb el
    // fitxer original i les metadades a dins, que és justament el camí que es
    // va tancar traient la drecera.
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext('2d')
    if (context === null) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, encodingFor(file.type), JPEG_QUALITY)
    })
    return blob ?? file
  } catch {
    return file
  }
}

/**
 * Amb què es torna a codificar, i per què no sempre JPEG.
 *
 * Treure la drecera va fer que TOT passés pel canvas, i el canvas sempre
 * escrivia JPEG. Però el selector de portada accepta PNG i WebP a posta, i el
 * JPEG no té canal alfa: un cartell exportat amb fons transparent sortia amb
 * tots els píxels transparents a negre, sense error i sense avís. La
 * previsualització no ho ensenyava perquè mostra el fitxer d'origen, no el
 * blob codificat.
 *
 * WebP i no PNG per a les que porten alfa: manté la transparència, comprimeix
 * com el JPEG —un PNG d'una foto de 1600 px se'n va a diversos megues i el
 * cubell de portades en talla a cinc— i els dos cubells que fan servir això
 * l'accepten (portades: jpeg, png i webp; avatars: jpeg i webp).
 *
 * Segueix sent una re-codificació, o sigui que les metadades marxen igual.
 */
function encodingFor(sourceType: string): string {
  return sourceType === 'image/png' || sourceType === 'image/webp' ? 'image/webp' : 'image/jpeg'
}

/**
 * Torna a codificar una imatge a JPEG, encongida si cal.
 *
 * `shrinkImage` torna el fitxer tal com va arribar quan no val la pena
 * re-codificar-lo, i per a una portada això està bé. Per a la galeria no: el
 * seu bucket només accepta JPEG i WebP, o sigui que un PNG petit passaria pel
 * camí ràpid i el rebutjaria el servidor — o pitjor, s'hi desaria amb un tipus
 * declarat que no és el que té a dins. Aquí sempre en surt un JPEG.
 */
async function encodeJpeg(
  source: Blob,
  maxEdge: number,
  quality: number,
  square = false,
): Promise<Blob> {
  // Un HEIC del carret fora de Safari: que arribi com a `UnreadableImage` i no
  // com un error anònim que la pantalla confondria amb una xarxa caiguda.
  let bitmap: ImageBitmap
  try {
    // Explícit: amb un retall quadrat, una orientació EXIF mal llegida talla
    // el costat que no toca.
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  } catch (cause) {
    throw new UnreadableImage(cause)
  }
  // Retall central quadrat si es demana: el costat curt mana i es perd el
  // sobrant de l'altre, repartit a banda i banda.
  const side = square ? Math.min(bitmap.width, bitmap.height) : null
  const cropW = side ?? bitmap.width
  const cropH = side ?? bitmap.height
  const cropX = Math.floor((bitmap.width - cropW) / 2)
  const cropY = Math.floor((bitmap.height - cropH) / 2)
  const scale = Math.min(1, maxEdge / Math.max(cropW, cropH))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(cropW * scale))
  canvas.height = Math.max(1, Math.round(cropH * scale))

  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no canvas')
  context.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  if (blob === null) throw new Error('no jpeg')
  return blob
}

/** La foto de galeria, a mida de mirar-la i no a mida de càmera. */
export function galleryImage(file: Blob): Promise<Blob> {
  return encodeJpeg(file, MAX_EDGE, JPEG_QUALITY)
}

/**
 * L'avatar: un quadrat de 384 px, JPEG, sense metadades.
 *
 * Es pinta sempre en un cercle amb `object-cover`, de 20 a 40 px a les llistes
 * i 112 a la fitxa d'edició del perfil. 384 és els 112 px de la mida més gran a
 * 3x (336) arrodonits cap amunt; a les llistes en sobra el triple. Pujar-lo a
 * 1600 px com una foto de galeria feia pesar l'objecte quatre-cents kB per a
 * una cara de 40. Es retalla en quadrat aquí, i no en deixar-ho a `object-cover`,
 * perquè el que sobra no ha de viatjar.
 */
const AVATAR_EDGE = 384
const AVATAR_QUALITY = 0.8

export function avatarImage(file: Blob): Promise<Blob> {
  return encodeJpeg(file, AVATAR_EDGE, AVATAR_QUALITY, true)
}

/**
 * La miniatura, feta al telèfon abans de pujar res.
 *
 * El sostre de la galeria no és el que ocupa sinó el que es baixa: dues-centes
 * fotos recorregudes a mida completa són trenta-sis megues cada vegada que algú
 * passa la graella, i amb miniatures en són cinc. Quatre-cents píxels és el
 * triple del que ocupa una casella de la graella en un telèfon a 3x.
 *
 * Es fa aquí i no en cap servidor perquè no n'hi ha cap: la decisió de no
 * dependre de la màquina de ningú és el que fa que això hagi de viure al
 * navegador de qui puja.
 */
const THUMB_EDGE = 400
const THUMB_QUALITY = 0.7

export function thumbnail(file: Blob): Promise<Blob> {
  return encodeJpeg(file, THUMB_EDGE, THUMB_QUALITY)
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
}

/** Uploads a cover and returns the object path to store on the event. */
export async function uploadCover(file: File, eventId: string): Promise<string> {
  const body = await shrinkImage(file)

  // The name follows what came back, not what was hoped for. Since shrinkImage
  // always re-encodes this is a JPEG in every path that worked, but it still
  // hands back the original if the canvas itself failed, and calling that .jpg
  // would store a PNG under a name that lies about it.
  const type = body.type === '' ? 'image/jpeg' : body.type
  const extension = EXTENSIONS[type] ?? 'jpg'

  // The id in the path, and a timestamp so replacing a cover never has to
  // fight a cached copy of the previous one under the same name.
  const path = `${eventId}/${String(Date.now())}.${extension}`

  const { error } = await supabase.storage
    .from(COVERS)
    .upload(path, body, { contentType: type, upsert: false })

  if (error) throw error
  return path
}

/**
 * Uploads an avatar and returns the path to store on the profile.
 *
 * `{uid}/{when}` — the id as a folder, so the storage policy can tell whose
 * face it is without consulting a table (migration 42, same shape as the door
 * photos in 34). A new object every time rather than a replacement: changing
 * your picture must not have to win a fight with a cached copy of the last one
 * under the same name.
 *
 * The bucket refuses PNG, so anything that is not already webp is called what
 * `avatarImage` will have encoded it as (always JPEG).
 */
export async function uploadAvatar(body: Blob, userId: string): Promise<string> {
  const type = body.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const extension = type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${String(Date.now())}.${extension}`

  const { error } = await supabase.storage
    .from(AVATARS)
    .upload(path, body, { contentType: type, upsert: false })

  if (error) throw error
  return path
}

/** Which half of the diptych, which is also which permission. */
export type DoorPhotoKind = 'entrada' | 'sortida'

/**
 * Uploads a door photograph and returns the path to store on the attendance.
 *
 * The path is the permission — see migration 34. `{kind}/{event}/{uid}/{when}`,
 * with the member's id as a folder rather than the filename, so a policy can
 * decide who may touch the object without consulting a table and so that
 * retaking one writes a new object instead of overwriting the old.
 *
 * The bucket refuses PNG, unlike the covers one, so the extension comes from
 * what the blob actually is and anything unexpected is called what it will be
 * encoded as.
 */
export async function uploadDoorPhoto(
  body: Blob,
  kind: DoorPhotoKind,
  eventId: string,
  userId: string,
): Promise<string> {
  const type = body.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const extension = type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${kind}/${eventId}/${userId}/${String(Date.now())}.${extension}`

  const { error } = await supabase.storage
    .from(DOOR_PHOTOS)
    .upload(path, body, { contentType: type, upsert: false })

  if (error) throw error
  return path
}

/**
 * Treure objectes, i dir-ho a qui guarda les seves URL signades.
 *
 * Aquest mòdul no té la memòria cau de React Query —viu en un `useState` de
 * `QueryProvider`, perquè cada test en munti una de nova—, o sigui que ho
 * anuncia i `QueryProvider` hi esborra les entrades d'aquells camins. Sense
 * això, la URL d'un objecte que ja no existeix hi podria quedar fins a una
 * hora i pintar un marc trencat a la primera pantalla que encara la demanés.
 */
export const STORAGE_REMOVED = 'storage-removed'
export const storageRemovals = new EventTarget()

export interface Removed {
  readonly bucket: string
  readonly paths: readonly string[]
}

/** Torna els camins que l'storage diu que ha tret, i llança si no ha pogut. */
export async function removeObjects(bucket: string, paths: readonly string[]): Promise<string[]> {
  if (paths.length === 0) return []
  const { data, error } = await supabase.storage.from(bucket).remove([...paths])
  if (error) throw error
  const removed = data.map((row) => row.name)
  storageRemovals.dispatchEvent(
    new CustomEvent<Removed>(STORAGE_REMOVED, { detail: { bucket, paths: removed } }),
  )
  return removed
}

/**
 * Deixa a la carpeta només `keep`, o res si és `null`. No llança mai.
 *
 * Es crida DESPRÉS que la fila apunti a l'objecte nou, mai abans: si es fes
 * abans i desar fallés, s'hauria esborrat la foto que la fila encara fa servir.
 * I no llança perquè quan arriba aquí el que la persona ha demanat ja ha
 * passat: un esborrat que falla sense cobertura és un objecte de més al bucket,
 * que l'escombrada diària (migració 91) acabarà traient, i no un error a la
 * pantalla d'algú que ja havia acabat.
 */
export async function keepOnly(bucket: string, folder: string, keep: string | null): Promise<void> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 })
    if (error) return
    await removeObjects(bucket, staleIn(folder, data, keep, Date.now()))
  } catch {
    // Vegeu a dalt: l'escombrada diària ho recull.
  }
}

/**
 * L'escombrada: el que la base diu que sobra i aquesta persona pot treure.
 *
 * `my_storage_garbage` ja filtra per les polítiques de qui crida, o sigui que
 * aquí no es decideix res: es demana i s'esborra, un bucket per crida. Torna
 * quants n'ha tret, o `null` si ni tan sols ha pogut preguntar. No llança mai:
 * es fa en segon pla i ningú no l'ha demanat.
 *
 * DE MIL EN MIL I TORNANT-HI. Una gimcana gran són milers de fotos, i totes
 * arriben a la junta el mateix dia trenta; a dos-cents per mòbil i dia
 * trigarien setmanes. Mil és el màxim que l'API esborra d'una crida, i mentre
 * la llista arriba plena es torna a demanar, fins a `SWEEP_ROUNDS` voltes. Si
 * una volta no treu res —una política que ha canviat, la xarxa que cau— es
 * para: tornar-hi donaria la mateixa llista.
 */
export async function sweepStorage(): Promise<number | null> {
  let removed = 0
  try {
    for (let round = 0; round < SWEEP_ROUNDS; round++) {
      const { data, error } = await supabase.rpc('my_storage_garbage', { p_limit: SWEEP_BATCH })
      if (error) return round === 0 ? null : removed
      let thisRound = 0
      for (const [bucket, paths] of byBucket(data)) {
        thisRound += (await removeObjects(bucket, paths).catch(() => [])).length
      }
      removed += thisRound
      if (data.length < SWEEP_BATCH || thisRound === 0) break
    }
    return removed
  } catch {
    return removed > 0 ? removed : null
  }
}

/**
 * Les URL signades: una consulta per objecte, i les peticions juntes.
 *
 * UNA CLAU PER CAMÍ. Abans la galeria signava amb una sola clau feta de tots
 * els camins, o sigui que una foto nova —o una d'esborrada, o una d'amagada per
 * la junta— canviava la clau, i en tornar a l'app es tornaven a signar i a
 * baixar totes les miniatures. Una nit de casa rural amb dues-centes fotos són
 * gigues. Amb una entrada per camí, el que ja estava signat es queda com era i
 * la miniatura que surt a l'inici i a la galeria és la mateixa URL.
 *
 * UNA PETICIÓ PER CUBELL I MICROTASK. Una entrada per camí no vol dir una
 * petició per camí: tot el que React demana en un mateix pas de render entra
 * en una sola crida a `createSignedUrls`. És el lot que ja feien els avatars,
 * fet general.
 *
 * UN ERROR ÉS UN ERROR. `createSignedUrls` no llança quan falla la xarxa:
 * torna `{ data: null, error }`. Abans això acabava en un `Map` buit desat com
 * a èxit, que no es tornava a demanar fins al cap de cinquanta minuts, i la
 * portada quedava en blanc tota aquella estona. Ara la consulta falla, React
 * Query la reintenta, i una consulta fallida es torna a demanar en tornar a
 * l'app. Una fila sense URL —l'objecte ja no hi és, o no és teu de veure— sí
 * que és una resposta, i es desa com a `null`.
 *
 * No s'exporta res que signi fora d'aquí: l'única porta és `signedUrlQuery`,
 * que porta la marca de `signedKey` (vegeu `signedQuery.ts`).
 */

const batches = new Map<
  string,
  { readonly paths: Set<string>; readonly ready: Promise<Map<string, string>> }
>()

async function signBatch(bucket: string, paths: readonly string[]): Promise<Map<string, string>> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls([...paths], SIGNED_TTL_SECONDS)
  if (error) throw error

  const out = new Map<string, string>()
  for (const row of data) {
    // Both fields are nullable in the response type: a batch call reports a
    // per-object error by returning nulls for that row rather than failing the
    // whole request.
    const path: unknown = row.path
    const url: unknown = row.signedUrl
    if (typeof path === 'string' && path !== '' && typeof url === 'string' && url !== '') {
      out.set(path, url)
    }
  }
  return out
}

function enqueue(bucket: string, path: string): Promise<string | null> {
  let batch = batches.get(bucket)
  if (batch === undefined) {
    const paths = new Set<string>()
    const ready = Promise.resolve().then(() => {
      batches.delete(bucket)
      return signBatch(bucket, [...paths])
    })
    batch = { paths, ready }
    batches.set(bucket, batch)
  }
  batch.paths.add(path)
  return batch.ready.then((urls) => urls.get(path) ?? null)
}

/** La consulta d'un objecte: la seva clau marcada i la seva URL, o `null`. */
export function signedUrlQuery(bucket: string, path: string) {
  return queryOptions({
    queryKey: signedKey(bucket, path),
    queryFn: () => enqueue(bucket, path),
  })
}

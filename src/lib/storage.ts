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

const SIGNED_TTL_SECONDS = 3600

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
 */
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= 2_000_000) return file

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)

    const context = canvas.getContext('2d')
    if (context === null) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    })
    return blob ?? file
  } catch {
    return file
  }
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
async function encodeJpeg(source: Blob, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const context = canvas.getContext('2d')
  if (context === null) throw new Error('no canvas')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
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

  // The name follows what came back, not what was hoped for: shrinkImage
  // hands back the untouched file when there is nothing worth re-encoding, and
  // calling that .jpg would store a PNG under a name that lies about it.
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
 * A URL for one stored object, good for an hour.
 *
 * Returns null rather than throwing: a cover that will not load is a missing
 * picture, and the screen already knows how to draw one of those.
 */
export async function signedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (path === null || path === '') return null

  // Anything already absolute was written before the bucket existed, or by
  // hand. Left alone rather than mangled into a storage path.
  if (path.startsWith('http://') || path.startsWith('https://')) return path

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

/** The same, for a list — one round trip instead of one per row. */
export async function signedUrls(
  bucket: string,
  paths: readonly (string | null)[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => p !== null && p !== ''))]
  const relative = wanted.filter((p) => !p.startsWith('http'))
  const out = new Map<string, string>()

  for (const absolute of wanted.filter((p) => p.startsWith('http'))) out.set(absolute, absolute)
  if (relative.length === 0) return out

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(relative, SIGNED_TTL_SECONDS)

  if (error || data === null) return out
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

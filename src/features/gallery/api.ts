import { DbError } from '@/lib/db'
import { EVENT_PHOTOS, galleryImage, signedUrls, thumbnail } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

/**
 * Les fotos d'una activitat.
 *
 * DUES FILES PER FOTO NO, DOS CAMINS PER FILA. La bona i la miniatura viuen a
 * la mateixa fila i a la mateixa carpeta, o sigui que comparteixen permís: no
 * hi ha manera de pujar una miniatura on no es pot pujar la seva foto, i
 * esborrar-ne una esborra les dues.
 *
 * L'ORDRE D'ESCRIPTURA IMPORTA, i és el mateix que fan les fotos de porta:
 * primer els objectes, després la fila que hi apunta. Al revés, una fila
 * apuntaria a un fitxer que potser no arriba mai. Si la fila falla, els
 * objectes es treuen — un fitxer orfe a un bucket no el troba ningú i es paga
 * per sempre.
 */

export interface GalleryPhoto {
  readonly id: string
  readonly path: string
  readonly thumb_path: string
  readonly created_at: string
  readonly user_id: string
  readonly nom: string
  readonly meva: boolean
  readonly denunciada: boolean
}

export interface PhotoCount {
  readonly quantes: number
  readonly persones: number
}

export type ReportReason = 'hi_surto' | 'no_es_d_aquella_nit' | 'altra'

export const galleryKeys = {
  all: () => ['gallery'] as const,
  photos: (eventId: string) => ['gallery', 'photos', eventId] as const,
  count: (eventId: string) => ['gallery', 'count', eventId] as const,
  urls: (paths: readonly string[]) => ['gallery', 'urls', ...paths] as const,
  reports: () => ['junta', 'photoReports'] as const,
}

export async function fetchPhotos(eventId: string): Promise<GalleryPhoto[]> {
  const { data, error } = await supabase.rpc('event_photos', { p_event_id: eventId })
  if (error) throw new DbError(error)
  return data ?? []
}

export async function fetchPhotoCount(eventId: string): Promise<PhotoCount> {
  const { data, error } = await supabase.rpc('event_photo_count', { p_event_id: eventId })
  if (error) throw new DbError(error)
  return data?.[0] ?? { quantes: 0, persones: 0 }
}

/** Les URL signades, en una sola volta. Una hora, com la resta de l'app. */
export async function fetchUrls(paths: readonly string[]): Promise<Map<string, string>> {
  return signedUrls(EVENT_PHOTOS, paths)
}

/**
 * Puja una foto i la deixa penjada.
 *
 * D'una en una i no totes alhora: quinze peticions en paral·lel sobre el wifi
 * d'una sala amb dues-centes persones és la manera de fer que no n'arribi cap.
 * Qui crida això les encadena.
 */
export async function uploadPhoto(file: File, eventId: string, userId: string): Promise<void> {
  const stamp = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`
  const base = `${eventId}/${userId}/${stamp}`
  const path = `${base}.jpg`
  const thumbPath = `${base}.thumb.jpg`

  // Sempre re-codificades, i no només encongides: el bucket refusa qualsevol
  // cosa que no sigui JPEG o WebP, i una foto que arriba ja petita se saltaria
  // el camí que la convertiria.
  const big = await galleryImage(file)
  const small = await thumbnail(big)

  const bucket = supabase.storage.from(EVENT_PHOTOS)

  const up = await bucket.upload(path, big, { contentType: 'image/jpeg', upsert: false })
  if (up.error) throw up.error

  const upThumb = await bucket.upload(thumbPath, small, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (upThumb.error) {
    await bucket.remove([path])
    throw upThumb.error
  }

  const { error } = await supabase
    .from('event_photos')
    .insert({ event_id: eventId, user_id: userId, path, thumb_path: thumbPath })

  if (error) {
    await bucket.remove([path, thumbPath])
    throw new DbError(error)
  }
}

/**
 * Esborra una foto.
 *
 * La fila primer i els objectes després, al revés de pujar-la: si la fila se'n
 * va i el fitxer es queda, ningú el pot trobar; si el fitxer se'n va i la fila
 * es queda, la graella ensenya un forat.
 */
export async function deletePhoto(photo: GalleryPhoto): Promise<void> {
  const { error } = await supabase.from('event_photos').delete().eq('id', photo.id)
  if (error) throw new DbError(error)
  await supabase.storage.from(EVENT_PHOTOS).remove([photo.path, photo.thumb_path])
}

export async function reportPhoto(photoId: string, motiu: ReportReason): Promise<string> {
  const { data, error } = await supabase.rpc('report_photo', {
    p_photo_id: photoId,
    p_motiu: motiu,
  })
  if (error) throw new DbError(error)
  return (data as { estat?: string } | null)?.estat ?? 'rebuda'
}

// ── la junta ────────────────────────────────────────────────────────────────

export interface ReportedPhoto {
  readonly photo_id: string
  readonly thumb_path: string
  readonly path: string
  readonly event_id: string
  readonly titol: string
  readonly pujada_per: string
  readonly motiu: ReportReason
  readonly quantes: number
  readonly despenjada: boolean
}

export async function fetchReported(): Promise<ReportedPhoto[]> {
  const { data, error } = await supabase.rpc('admin_reported_photos')
  if (error) throw new DbError(error)
  return (data ?? []) as ReportedPhoto[]
}

export async function decidePhoto(photoId: string, despenja: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_decide_photo', {
    p_photo_id: photoId,
    p_despenja: despenja,
  })
  if (error) throw new DbError(error)
}

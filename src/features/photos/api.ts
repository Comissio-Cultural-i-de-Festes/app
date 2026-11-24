import { DbError, unwrapAs } from '@/lib/db'
import { DOOR_PHOTOS, keepOnly, removeObjects, uploadDoorPhoto } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

/**
 * The nights you were at, and the two photographs of each.
 *
 * One RPC and one batch of signed URLs, because the diptych screen shows a
 * night and a list of the nights before it, and doing that as a request per
 * night would be a request per night.
 *
 * `my_photos()` returns every night you checked in to, photographs or not.
 * That looks like too much until you read the drawings: there is a case for
 * "you have neither" — the junta had the door camera off and you never took
 * yours — and the screen for it has to be reachable by somebody who was there.
 */

export interface Night {
  readonly event_id: string
  readonly titulo: string
  readonly starts_at: string
  readonly entry_photo_url: string | null
  readonly exit_photo_url: string | null
  readonly checked_in_at: string | null
  readonly exit_photo_at: string | null
}

export const photoKeys = {
  nights: () => ['photos', 'nights'] as const,
  /** El «ara no» de la targeta de sortida, que viu a localStorage. */
  exitDismissed: (eventId: string) => ['photos', 'exitDismissed', eventId] as const,
}

export async function fetchNights(): Promise<Night[]> {
  return unwrapAs<Night[]>(supabase.rpc('my_photos').select('*'))
}

export function pathsOf(nights: readonly Night[]): string[] {
  return nights.flatMap((n) =>
    [n.entry_photo_url, n.exit_photo_url].filter((p): p is string => p !== null),
  )
}

/** Which of the drawings' three cases this night is. */
export type NightShape = 'both' | 'entryOnly' | 'neither'

export function shapeOf(night: Night): NightShape {
  if (night.entry_photo_url !== null && night.exit_photo_url !== null) return 'both'
  if (night.exit_photo_url !== null || night.entry_photo_url !== null) return 'entryOnly'
  return 'neither'
}

/**
 * Your own photograph at the end of a night.
 *
 * Upload first, then point the row at it — the same order as the door, and for
 * the same reason: the path does not exist until the object does. If the RPC
 * refuses, the object is taken straight back out; a stray photograph of
 * somebody's face is not something to leave lying around because a write
 * failed.
 *
 * And once the row points at the new one, the one it replaces goes too. Until
 * now a retaken selfie left the old one in the bucket for ever: a photograph of
 * somebody's face that nothing pointed at any more. Not awaited and never
 * throwing: the picture has been saved by then, and whatever survives a
 * dropped connection the daily sweep (migration 91) picks up.
 */
export async function saveExitPhoto(eventId: string, userId: string, photo: Blob): Promise<void> {
  const path = await uploadDoorPhoto(photo, 'sortida', eventId, userId)

  const { data, error } = await supabase.rpc('set_exit_photo', {
    p_event_id: eventId,
    p_path: path,
  })
  if (error) {
    await supabase.storage.from(DOOR_PHOTOS).remove([path])
    throw new DbError(error)
  }

  const verdict = (data as { estat?: string } | null)?.estat
  if (verdict !== 'desada') {
    await supabase.storage.from(DOOR_PHOTOS).remove([path])
    throw new Error(verdict ?? 'unknown')
  }

  void keepOnly(DOOR_PHOTOS, `sortida/${eventId}/${userId}`, path)
}

/**
 * La d'arribada, que des de la migració 36 també te la fas tu.
 *
 * Mateixa forma que la de sortida i pel mateix motiu: el camí no existeix fins
 * que l'objecte hi és, o sigui que primer puja i després la fila hi apunta. Si
 * la RPC diu que no, l'objecte se'n va tot seguit — una foto solta de la cara
 * d'algú no es deixa per allà perquè una escriptura ha fallat. I la que
 * substitueix se'n va un cop la fila apunta a la nova, com a la de sortida.
 */
export async function saveEntryPhoto(eventId: string, userId: string, photo: Blob): Promise<void> {
  const path = await uploadDoorPhoto(photo, 'entrada', eventId, userId)

  const { data, error } = await supabase.rpc('set_entry_photo', {
    p_event_id: eventId,
    p_path: path,
  })
  if (error) {
    await supabase.storage.from(DOOR_PHOTOS).remove([path])
    throw new DbError(error)
  }

  const verdict = (data as { estat?: string } | null)?.estat
  if (verdict !== 'desada') {
    await supabase.storage.from(DOOR_PHOTOS).remove([path])
    throw new Error(verdict ?? 'unknown')
  }

  void keepOnly(DOOR_PHOTOS, `entrada/${eventId}/${userId}`, path)
}

/**
 * Forgetting one. The row lets go first and the file goes second: the other
 * order leaves a moment where the diptych points at something that is gone,
 * which draws a broken picture rather than the "take one" it should.
 */
export async function removeExitPhoto(eventId: string): Promise<void> {
  const { data, error } = await supabase.rpc('clear_exit_photo', { p_event_id: eventId })
  if (error) throw new DbError(error)

  const path = (data as { cami?: string } | null)?.cami
  // Through `removeObjects`, so its signed URL leaves the cache with it. A
  // failure is still not this screen's to report: the row has let go, and the
  // daily sweep takes what is left.
  if (typeof path === 'string' && path !== '') {
    await removeObjects(DOOR_PHOTOS, [path]).catch(() => [])
  }
}

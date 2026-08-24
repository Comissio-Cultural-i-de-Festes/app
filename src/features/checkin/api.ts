import { DbError } from '@/lib/db'
import { HERE, type Queued, drop, put, waiting } from '@/lib/queue'
import { supabase } from '@/lib/supabase'

/**
 * Fitxar des d'on ets.
 *
 * El servidor decideix, no aquest fitxer: envia la posició tal com la dóna el
 * navegador i el veredicte torna dient si val. No hi ha cap comparació de
 * distàncies aquí a posta — una regla que viu al client és una regla que es
 * pot reescriure, i les coordenades de l'esdeveniment no surten mai de la base
 * justament per això.
 */

/** El que pot sortir malament abans d'arribar a preguntar-ho al servidor. */
export type PositionError = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export type Verdict =
  | { readonly estat: 'fet'; readonly punts: number; readonly metres: number; readonly walkin: boolean }
  | { readonly estat: 'ja_hi_ets'; readonly quan: string }
  | { readonly estat: 'lluny'; readonly metres: number; readonly radi: number }
  | { readonly estat: 'tancat'; readonly obre: string | null; readonly tanca: string | null }
  | { readonly estat: 'sense_lloc' }
  | { readonly estat: 'no_hi_es' }

export interface Fix {
  readonly lat: number
  readonly lng: number
  readonly precisio: number | null
}

/**
 * On ets, o per què no se sap.
 *
 * Els tres errors separats i no un de sol: porten a consells diferents.
 * «Denegat» vol dir anar als ajustos, «no disponible» vol dir sortir a fora, i
 * «temps esgotat» vol dir tornar-ho a provar. «No s'ha pogut» no és cap consell.
 *
 * `enableHighAccuracy` encén el GPS de debò en comptes de deduir-ho de les
 * antenes, que és la diferència entre vint metres i cinc-cents — i cinc-cents
 * dins d'un edifici és no saber en quin edifici ets.
 */
export function getFix(timeoutMs = 15_000): Promise<Fix> {
  if (typeof navigator.geolocation === 'undefined') {
    return Promise.reject(new PositionFailure('unsupported'))
  }

  return new Promise<Fix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          // `accuracy` és el radi del cercle de confiança en metres. El
          // servidor l'afegeix al radi de l'esdeveniment, amb topall.
          precisio: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        })
      },
      (err) => {
        reject(
          new PositionFailure(
            err.code === err.PERMISSION_DENIED
              ? 'denied'
              : err.code === err.TIMEOUT
                ? 'timeout'
                : 'unavailable',
          ),
        )
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}

export class PositionFailure extends Error {
  readonly kind: PositionError
  constructor(kind: PositionError) {
    super(kind)
    this.name = 'PositionFailure'
    this.kind = kind
  }
}

/**
 * Un fitxatge esperant cobertura.
 *
 * El moment i la posició queden gravats aquí i s'envien tal com eren, perquè
 * el que val és on eres quan hi eres i no on ets quan torna la xarxa. El
 * servidor no es creu l'hora: la refusa si cau fora de la finestra.
 */
export interface QueuedCheckin extends Queued {
  readonly id: string
  readonly eventId: string
  readonly lat: number
  readonly lng: number
  readonly precisio: number | null
  readonly takenAt: number
}

async function send(item: QueuedCheckin): Promise<Verdict> {
  const { data, error } = await supabase.rpc('check_in_here', {
    p_event_id: item.eventId,
    p_lat: item.lat,
    p_lng: item.lng,
    // Els tipus generats diuen `number | undefined` perquè el paràmetre té
    // valor per defecte. Null i undefined arriben igual a Postgres, però amb
    // exactOptionalPropertyTypes s'han de dir diferent.
    ...(item.precisio === null ? {} : { p_precisio_m: item.precisio }),
    p_client_request_id: item.id,
    p_taken_at: new Date(item.takenAt).toISOString(),
  })
  if (error) throw new DbError(error)
  return data as unknown as Verdict
}

/**
 * Fitxa, i si no hi arriba, s'ho apunta.
 *
 * La cua s'escriu primer i s'esborra en aterrar, igual que a la porta: una
 * petició que es penja trenta segons en una masia quedaria perduda entre les
 * dues. L'`id` es genera un sol cop i és el que fa que reenviar-ho no pagui
 * dues vegades.
 */
export async function checkInHere(eventId: string, fix: Fix): Promise<Verdict> {
  const item: QueuedCheckin = {
    id: crypto.randomUUID(),
    eventId,
    lat: fix.lat,
    lng: fix.lng,
    precisio: fix.precisio,
    takenAt: Date.now(),
    at: Date.now(),
    tries: 0,
  }
  await put(HERE, item)

  try {
    const verdict = await send(item)
    await drop(HERE, item.id)
    return verdict
  } catch (cause) {
    // Es queda a la cua a posta. Si el veredicte hagués estat «lluny» el
    // servidor ja hauria contestat: arribar aquí vol dir que no hi ha arribat.
    await put(HERE, { ...item, tries: item.tries + 1 })
    throw cause
  }
}

export async function queuedCheckins(): Promise<QueuedCheckin[]> {
  return waiting<QueuedCheckin>(HERE)
}

/** Envia el que hi ha esperant. S'atura a la primera que falla. */
export async function flushCheckins(): Promise<number> {
  let sent = 0
  for (const item of await queuedCheckins()) {
    try {
      await send(item)
      await drop(HERE, item.id)
      sent += 1
    } catch {
      await put(HERE, { ...item, tries: item.tries + 1 })
      break
    }
  }
  return sent
}

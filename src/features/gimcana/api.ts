import { DbError, isPermanent } from '@/lib/db'
import { drop, NotSaved, PROVES, put, waiting } from '@/lib/queue'
import { galleryImage, GIMCANA_PHOTOS, UnreadableImage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

/**
 * La gimcana.
 *
 * LA FOTO VA A LA CUA AMB LA RESTA, i és el que fa diferent aquesta cua de les
 * altres tres: una prova sense foto no és una prova. Guardar-ne quinze són
 * desenes de megues a IndexedDB, i és el preu de «sense cobertura també
 * funciona» — que a una sala amb dues-centes persones i una sola antena no és
 * cap cas rebuscat.
 *
 * L'IDENTIFICADOR DE PETICIÓ ES GENERA UN COP, quan es prem el botó, i no es
 * torna a generar mai. `submit_prova` és idempotent sobre ell, o sigui que
 * reenviar la cua sencera dues vegades deixa una sola fila. Aquesta garantia
 * viu a la base; aquí l'única feina és no perdre l'identificador.
 */

export interface GimcanaProva {
  readonly id: string
  readonly ordre: number
  readonly titol: string
  readonly descripcio: string | null
  readonly punts: number
  /** L'estat per al TEU equip, no per a tu: si un company ja l'ha feta, ja està. */
  readonly estat: 'validada' | 'pendent' | 'rebutjada' | null
  readonly motiu: string | null
  readonly qui: string | null
}

export interface GimcanaTeam {
  readonly id: string
  readonly nom: string | null
  readonly escola: string | null
  /**
   * El número de l'equip, des d'1, que és com es diu un equip sense nom.
   * Opcional perquè una base d'abans de la 97 no el porta.
   */
  readonly ordre?: number
}

export type Gimcana =
  | { readonly estat: 'no_hi_es' }
  | { readonly estat: 'tancada' }
  | {
      readonly estat: 'oberta'
      readonly id: string
      readonly mena_equips: 'escoles' | 'junta' | 'sorteig' | 'lliure'
      readonly topall_equip: number | null
      readonly equip: GimcanaTeam | null
      readonly proves: readonly GimcanaProva[]
      readonly a_la_cua: number
      /**
       * Si pots canviar d'equip tu sol: mode lliure i cap foto enviada encara.
       * Opcional pel mateix motiu que `ordre`.
       */
      readonly pots_canviar?: boolean
    }

export interface TeamRow {
  readonly id: string
  readonly nom: string | null
  readonly escola: string | null
  readonly quants: number
  readonly meu: boolean
  readonly ordre?: number
}

export interface ScoreRow {
  readonly equip_id: string
  readonly nom: string | null
  readonly escola: string | null
  readonly punts: number
  readonly proves: number
  readonly meu: boolean
  readonly ordre?: number
}

export interface QueueRow {
  readonly id: string
  readonly path: string
  readonly prova: string
  readonly punts: number
  readonly qui: string
  /** El nom de l'equip, i és `null` quan els va crear un sorteig. */
  readonly equip: string | null
  /** El seu número, que és com s'anomena un equip sense nom. Compta des d'1. */
  readonly equip_ordre: number
  readonly escola: string | null
  readonly quan: string
  readonly a_la_cua: number
  /**
   * Quan la foto va deixar de comptar (migració 91): la gimcana fa més de trenta
   * dies que es va tancar. Opcional perquè el paquet i la base es despleguen per
   * separat, i contra una base d'abans de la 91 la columna no hi és.
   */
  readonly foto_esborrada_at?: string | null
}

export const gimcanaKeys = {
  all: () => ['gimcana'] as const,
  one: (eventId: string) => ['gimcana', 'one', eventId] as const,
  existeix: (eventId: string) => ['gimcana', 'existeix', eventId] as const,
  teams: (gimcanaId: string) => ['gimcana', 'teams', gimcanaId] as const,
  board: (gimcanaId: string) => ['gimcana', 'board', gimcanaId] as const,
  queue: (eventId: string) => ['junta', 'gimcana', eventId] as const,
  /** La fila de la gimcana per a la junta, sense passar per `gimcana_for_event`. */
  row: (eventId: string) => ['junta', 'gimcana', 'row', eventId] as const,
  people: (gimcanaId: string) => ['junta', 'gimcana', 'people', gimcanaId] as const,
}

export async function fetchGimcana(eventId: string): Promise<Gimcana> {
  const { data, error } = await supabase.rpc('gimcana_for_event', { p_event_id: eventId })
  if (error) throw new DbError(error)
  return data as unknown as Gimcana
}

/**
 * Si un esdeveniment té gimcana, i res més.
 *
 * Per a la fitxa de l'esdeveniment, que només ha de saber si dibuixa el camí a
 * la cua. NO VA PER `gimcana_for_event`: aquella RPC és volàtil i, de passada,
 * pot posar a un equip qui la crida si encara no en té cap. Obrir la fitxa d'un
 * esdeveniment no pot ser apuntar-se a la seva gimcana.
 */
export async function fetchTeGimcana(eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('gimcanes')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new DbError(error)
  return data !== null
}

export async function fetchTeams(gimcanaId: string): Promise<TeamRow[]> {
  const { data, error } = await supabase.rpc('gimcana_teams', { p_gimcana_id: gimcanaId })
  if (error) throw new DbError(error)
  return data ?? []
}

export async function fetchBoard(gimcanaId: string): Promise<ScoreRow[]> {
  const { data, error } = await supabase.rpc('gimcana_scoreboard', { p_gimcana_id: gimcanaId })
  if (error) throw new DbError(error)
  return data ?? []
}

/**
 * La gimcana d'una activitat tal com la veu la junta: quina és i com es fan
 * els equips.
 *
 * NO VA PER `gimcana_for_event`, pel mateix motiu que `fetchTeGimcana`: en
 * mode sorteig aquella RPC posa a l'equip més petit qui la crida. Obrir la
 * pantalla de repartir no pot ser apuntar-hi qui reparteix.
 */
export async function fetchGimcanaRow(
  eventId: string,
): Promise<{ readonly id: string; readonly mena_equips: string } | null> {
  const { data, error } = await supabase
    .from('gimcanes')
    .select('id, mena_equips')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new DbError(error)
  return data
}

export interface PersonRow {
  readonly user_id: string
  readonly nombre: string
  readonly avatar_url: string | null
  /** L'equip on és ara, o `null` si encara no en té. */
  readonly equip_id: string | null
  readonly ha_arribat: boolean
  /** Quantes fotos ha enviat en aquesta gimcana, validades o no. */
  readonly fotos: number
}

export async function fetchPeople(gimcanaId: string): Promise<PersonRow[]> {
  const { data, error } = await supabase.rpc('admin_gimcana_people', {
    p_gimcana_id: gimcanaId,
  })
  if (error) throw new DbError(error)
  // Els tipus generats diuen `string` a `avatar_url` i `equip_id` perquè una
  // funció que torna una taula no declara què pot ser nul. `PersonRow` diu la
  // veritat (qui no té foto, qui no té equip) i el tipus generat hi encaixa.
  return data ?? []
}

/**
 * Posa algú en un equip, el mou, o el treu si `equipId` és `null`.
 *
 * Torna l'estat del servidor: `fet`, o `no_hi_es` / `no_es_tria` quan l'equip
 * ja no hi és o la gimcana ha passat a mode escoles mentre es mirava.
 */
export async function setTeam(
  gimcanaId: string,
  userId: string,
  equipId: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_set_team', {
    p_gimcana_id: gimcanaId,
    p_user_id: userId,
    ...(equipId === null ? {} : { p_equip_id: equipId }),
  })
  if (error) throw new DbError(error)
  return (data as { estat?: string } | null)?.estat ?? 'fet'
}

export async function pickTeam(equipId: string): Promise<string> {
  const { data, error } = await supabase.rpc('pick_team', { p_equip_id: equipId })
  if (error) throw new DbError(error)
  return (data as { estat?: string } | null)?.estat ?? 'fet'
}

// ── la cua ──────────────────────────────────────────────────────────────────

interface QueuedProva {
  /** L'identificador de petició, i també la clau de la cua. */
  readonly id: string
  readonly provaId: string
  readonly photo: Blob
  readonly at: number
  readonly tries: number
}

/**
 * Envia una prova, i abans de res la desa.
 *
 * L'ordre no és casual: primer a la cua i després a la xarxa, com els
 * fitxatges. Si el mòbil no té cobertura —o l'app es mor a mig enviar— la foto
 * ja és a IndexedDB i sortirà sola. Al revés, prémer el botó sense cobertura no
 * deixaria cap rastre enlloc.
 */
/**
 * La foto no ha arribat a ser a la cua: el canvas no ha pogut codificar-la o
 * IndexedDB ha dit que no. «Desada, s'enviarà sola» seria mentida, i la
 * pantalla ho ha de dir amb un error i no amb l'avís de la cua. És la mateixa
 * classe que fan servir les altres tres cues; es reexporta perquè la pantalla
 * la importa d'aquí.
 */
export { NotSaved }

export async function submitProva(provaId: string, photo: Blob): Promise<string> {
  const id = crypto.randomUUID()
  let item: QueuedProva
  let saved: boolean
  try {
    // Encongida abans de desar-la a la cua i no després: guardar el fotograma
    // sencer de la càmera seria omplir IndexedDB de megues que ningú mirarà a
    // aquella mida, i la junta la mira en un telèfon.
    const small = await galleryImage(photo)
    item = { id, provaId, photo: small, at: Date.now(), tries: 0 }
    saved = await put(PROVES, item)
  } catch (cause) {
    // Un fitxer il·legible té el seu propi missatge.
    if (cause instanceof UnreadableImage) throw cause
    throw new NotSaved(cause)
  }
  try {
    return await send(item)
  } catch (cause) {
    if (isPermanent(cause)) throw cause
    // `put` de la cua no peta: sense IndexedDB —mode privat, quota, disc ple—
    // torna `false`. Si l'enviament ha fallat i la foto no és a la cua,
    // «desada» seria mentida: ningú no la tornarà a intentar.
    if (!saved) throw new NotSaved(cause)
    throw cause
  }
}

/** Si aquesta prova encara espera a la cua, per saber quan ha sortit. */
export async function isQueued(provaId: string): Promise<boolean> {
  const rows = await waiting<QueuedProva>(PROVES)
  return rows.some((row) => row.provaId === provaId)
}

/**
 * Les files que ara mateix s'estan pujant, tant si les ha enviat el botó com la
 * cua. Sense això, amb una wifi saturada (la pujada triga més que el
 * temporitzador de la cua) o tirant enrere mentre s'envia, la mateixa foto
 * sortiria dues vegades, i si una falla fa `put` d'una fila que l'altra ja
 * havia esborrat: la foto torna a la cua i es puja una tercera.
 */
const inFlight = new Set<string>()

async function send(item: QueuedProva): Promise<string> {
  inFlight.add(item.id)
  try {
    return await upload(item)
  } finally {
    inFlight.delete(item.id)
  }
}

async function upload(item: QueuedProva): Promise<string> {
  const userId = await localUserId()
  const path = `${item.provaId}/${userId}/${item.id}.jpg`

  const up = await supabase.storage
    .from(GIMCANA_PHOTOS)
    .upload(path, item.photo, { contentType: 'image/jpeg', upsert: false })

  // `upsert` no serveix aquí: el bucket no té cap política d'UPDATE —a posta,
  // com `door-photos`— i la meitat d'actualitzar d'un upsert la rebutja RLS amb
  // un 403. La cua reintenta el mateix camí, o sigui que la segona provatura
  // xocava per sempre.
  //
  // Amb `upsert: false`, un segon intent dóna 409: la foto ja és a dalt, que és
  // exactament el que cal per seguir. L'identificador de petició fa la resta.
  if (up.error && !alreadyThere(up.error)) throw up.error

  const { data, error } = await supabase.rpc('submit_prova', {
    p_prova_id: item.provaId,
    p_path: path,
    p_client_request_id: item.id,
  })
  if (error) throw new DbError(error)

  const estat = (data as { estat?: string } | null)?.estat ?? 'enviada'
  // Encara sense equip: en mode junta, fins que la junta no t'hi posa; o la
  // junta t'ha tret d'un equip amb una foto a la cua. No és un refús de la
  // foto —quan tinguis equip, valdrà—, o sigui que es queda a la cua i surt
  // sola a la propera volta. Treure-la aquí era perdre-la sense dir res.
  if (estat === 'sense_equip') throw new NoTeamYet()

  await drop(PROVES, item.id)
  return estat
}

/**
 * La foto és a la cua però no pot entrar fins que tinguis equip.
 *
 * Sense codi de Postgres a propòsit: `flushProves` la deixa a la cua i
 * `isPermanent` no la considera un refús, que és exactament el que és.
 */
export class NoTeamYet extends Error {
  constructor() {
    super('sense equip')
    this.name = 'NoTeamYet'
  }
}

/**
 * Qui puja la foto, llegit de la sessió d'aquest mòbil i no del servidor.
 *
 * `getUser()` és una crida a /auth/v1/user per cada prova i per cada
 * reintent, i els endpoints d'Auth tenen límit per IP: dues-centes persones
 * darrere la mateixa wifi s'esgoten la quota entre elles. Aquí no cal validar
 * res —el servidor ja ho fa amb el JWT que acompanya la pujada i
 * `submit_prova` atribueix per `auth.uid()`—, només saber quin camí escriure.
 *
 * Sense sessió llegible no s'envia: l'error no porta codi de Postgres, de
 * manera que `flushProves` deixa la foto a la cua per a la propera volta en
 * comptes de pujar-la a un camí sense propietari.
 */
async function localUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (id === undefined) throw new Error('no session')
  return id
}

/** Un 409 vol dir que la foto ja hi era: la primera provatura la va deixar. */
function alreadyThere(error: unknown): boolean {
  const e = error as { statusCode?: string; message?: string } | null
  return e?.statusCode === '409' || (e?.message ?? '').includes('already exists')
}

/**
 * Buida la cua i diu quantes n'han entrat.
 *
 * Una que falli es queda: la següent vegada hi tornarà. Una que el servidor
 * refusa per sempre —la prova ja no hi és, la gimcana s'ha tancat— també es
 * treu, perquè reintentar-la eternament és guardar una foto que no arribarà
 * mai enlloc.
 */
export function flushProves(): Promise<number> {
  flushing ??= drainOnce().finally(() => {
    flushing = null
  })
  return flushing
}

let flushing: Promise<number> | null = null

async function drainOnce(): Promise<number> {
  const rows = await waiting<QueuedProva>(PROVES)
  let sent = 0

  for (const row of rows) {
    if (inFlight.has(row.id)) continue
    try {
      await send(row)
      sent += 1
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code ?? ''
      // NO EL 42501. A `submit_prova` és sempre de qui crida —«nomes socis», o
      // la sessió perduda que surt com a `anon` i no té permís per executar-la,
      // comprovat contra la passarel·la—, mai de la foto. Esborrar-la amb
      // cobertura dolenta i el refresc del token perdut era llençar la prova
      // d'algú que, quan torna la sessió, l'hauria vist entrar.
      if (code.startsWith('22') || code.startsWith('23')) {
        await drop(PROVES, row.id)
      } else {
        await put(PROVES, { ...row, tries: row.tries + 1 })
      }
    }
  }
  return sent
}

// ── la junta ────────────────────────────────────────────────────────────────

export async function fetchQueue(eventId: string): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc('admin_gimcana_queue', { p_event_id: eventId })
  if (error) throw new DbError(error)
  return data ?? []
}

export async function decideProva(id: string, val: boolean, motiu?: string): Promise<string> {
  // Els tipus generats diuen `string | undefined` perquè el paràmetre té valor
  // per defecte. Null i undefined arriben igual a Postgres, però amb
  // exactOptionalPropertyTypes s'han de dir diferent — el mateix parany que a
  // check_in_here.
  const { data, error } = await supabase.rpc('admin_decide_prova', {
    p_enviament_id: id,
    p_val: val,
    ...(motiu === undefined ? {} : { p_motiu: motiu }),
  })
  if (error) throw new DbError(error)
  return (data as { estat?: string } | null)?.estat ?? 'validada'
}

export async function undoProva(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_undo_prova', { p_enviament_id: id })
  if (error) throw new DbError(error)
}

export interface ProvaDraft {
  /**
   * La prova que ja existeix, si n'és una. Des de la 97 el servidor la
   * conserva (i amb ella les fotos) en comptes d'esborrar-la i fer-ne una de
   * nova; sense `id` és una prova nova.
   */
  readonly id?: string
  readonly titol: string
  readonly descripcio: string
  readonly punts: number
  readonly ordre: number
}

export async function saveGimcana(
  eventId: string,
  mena: string,
  topall: number | null,
  proves: readonly ProvaDraft[],
): Promise<void> {
  const { error } = await supabase.rpc('admin_save_gimcana', {
    p_event_id: eventId,
    p_mena_equips: mena,
    p_proves: proves as unknown as never,
    ...(topall === null ? {} : { p_topall: topall }),
  })
  if (error) throw new DbError(error)
}

export async function saveTeams(gimcanaId: string, noms: readonly string[]): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_teams', {
    p_gimcana_id: gimcanaId,
    p_noms: noms as string[],
  })
  if (error) throw new DbError(error)
  return (data as { estat?: string } | null)?.estat ?? 'desats'
}

export async function shuffleTeams(gimcanaId: string, quants: number): Promise<string> {
  const { data, error } = await supabase.rpc('admin_shuffle_teams', {
    p_gimcana_id: gimcanaId,
    p_quants: quants,
  })
  if (error) throw new DbError(error)
  return (data as { estat?: string } | null)?.estat ?? 'remenats'
}

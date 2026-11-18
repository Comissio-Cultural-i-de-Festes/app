/**
 * The scans that have not reached the server yet.
 *
 * A door is the worst place in the world for a phone signal: a basement, two
 * hundred people, and everybody's data at once. The scanner cannot wait for a
 * round trip before letting the next person through, so a scan is written here
 * first and sent afterwards.
 *
 * IndexedDB and not localStorage: localStorage is synchronous, so every write
 * blocks the frame the camera is drawing into, and Safari clears it under
 * storage pressure without warning. This survives the app being killed, which
 * is the case that matters — the queue is worthless if it dies with the tab.
 *
 * Every entry carries a `client_request_id` generated once, when the scan
 * happened, and never regenerated. `check_in` is idempotent on that id, so
 * resending the queue twice grants points once. That guarantee lives in the
 * database; this file's only job is not to lose the id.
 */

const DB_NAME = 'comi'
const DB_VERSION = 4

/**
 * Four queues, one database.
 *
 * The scanner's is the one that matters and the one everything here was
 * written for. The others share the plumbing because the shape is identical
 * — write it down, try to send it, rub it out when it lands — and a second
 * IndexedDB with its own open handshake would be the same code twice.
 */
export const SCANS = 'checkin-queue'
export const IDEAS = 'idea-queue'
export const HERE = 'here-queue'
export const PROVES = 'gimcana-queue'

export interface QueuedScan {
  /** Generated at the moment of the scan. The idempotency key. */
  readonly clientRequestId: string
  readonly eventId: string
  readonly qrToken: string | null
  readonly userId: string | null
  readonly at: number
  /** How many times sending has failed. Only for showing the person a number. */
  readonly tries: number
  /** Set when it is no longer waiting to be sent, and why. See `Held`. */
  readonly held?: Held | undefined
}

/**
 * Why a scan is still on the phone although nothing is going to send it.
 *
 * Both are somebody who walked through the door on the strength of "saved"
 * and whose card nobody saw, because it was answered an hour later by a
 * flush. Kept rather than dropped, so the junta can see them and decide.
 */
export type Held =
  /**
   * The server raised an error about the scan itself, with this SQLSTATE: a
   * token that is not a uuid, a request carrying both a QR and a name. Sending
   * it again gets the same answer, and first in line it would hold up every
   * scan behind it.
   */
  | { readonly kind: 'refused'; readonly code: string }
  /**
   * It landed, and the answer asks for somebody to act: not a member, not
   * active, in without being signed up. The status and the name, when the
   * server gave one, are what the junta needs to find the person.
   */
  | { readonly kind: 'answered'; readonly status: string; readonly nombre: string | null }

/**
 * How long opening the database may take before the caller is told it did not.
 *
 * Opening is a handshake with no deadline of its own, and Safari has shipped
 * versions where it simply never answers. Everything here waits on it, so
 * without one a scan would sit in `enqueue` forever and never even try the
 * network. Three seconds is far beyond a healthy open, which takes
 * milliseconds; a late answer is not wasted, because it is still adopted.
 *
 * It covers the open and nothing else. A read or a write on a connection that
 * is already open has no limit here; it has never been seen to hang, and
 * timing out a write that then commits would report "not saved" about
 * something that was.
 */
export const OPEN_DEADLINE_MS = 3_000

/**
 * The connection, once there is one. Not the attempt to get it.
 *
 * IT USED TO BE THE PROMISE, ERRORS INCLUDED. The first open was kept for the
 * life of the page, so one that failed or was blocked — the day the version
 * goes up with an old tab still open — left every later call resolving to
 * nothing, and `enqueue` returned as happily as if it had written. The door
 * said "queued" about scans that were nowhere. Now only a working connection
 * is kept; a failure is reported to that one caller and the next one tries
 * again.
 */
let connection: IDBDatabase | null = null
/** One attempt at a time, shared by whoever asks while it runs. */
let opening: Promise<IDBDatabase | null> | null = null
/**
 * An open that is still pending after its caller was told no: blocked by
 * another tab holding an older version, or past `OPEN_DEADLINE_MS`.
 *
 * Browsers run opens to one database first in, first out, so a second open
 * would only queue behind it and answer no later than it does. Callers are
 * told no straight away instead. It is not abandoned: if it ever goes
 * through, it is adopted, and `onReconnect` says so.
 */
let heldBack = false

const reconnected = new Set<() => void>()

/**
 * Called when the queue becomes usable after having told somebody it was not.
 *
 * For the screens that say "this phone cannot keep a queue": that line would
 * otherwise stay up until something else made them ask again.
 */
export function onReconnect(listener: () => void): () => void {
  reconnected.add(listener)
  return () => {
    reconnected.delete(listener)
  }
}

function open(): Promise<IDBDatabase | null> {
  if (connection !== null) return Promise.resolve(connection)
  if (heldBack) return Promise.resolve(null)
  opening ??= connect(DB_VERSION).finally(() => {
    opening = null
  })
  return opening
}

function connect(version: number | undefined): Promise<IDBDatabase | null> {
  return new Promise<IDBDatabase | null>((resolve) => {
    // Private browsing on iOS, a blocked-storage setting, or a browser that
    // simply refuses. A door with no queue still works, one scan at a time,
    // and that is a far better outcome than a screen that will not load.
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version)
    } catch {
      resolve(null)
      return
    }

    let late = false
    const timer = setTimeout(() => {
      late = true
      heldBack = true
      resolve(null)
    }, OPEN_DEADLINE_MS)
    const settle = (db: IDBDatabase | null) => {
      clearTimeout(timer)
      resolve(db)
    }

    request.onupgradeneeded = () => {
      upgrade(request.result)
    }
    request.onsuccess = () => {
      heldBack = false
      const db = adopt(request.result)
      settle(db)
      if (late) for (const listener of reconnected) listener()
    }
    request.onerror = () => {
      heldBack = false
      // This tab's code is older than the database: another tab has already
      // upgraded it. Every version so far only adds stores, so the newer
      // database has all the ones this code knows, and opening it at whatever
      // version it is keeps an old tab saving instead of failing until reload.
      // A version that one day removes a store fails at `transaction()`, which
      // `run` reports as not saved.
      if (version !== undefined && request.error?.name === 'VersionError') {
        void connect(undefined).then(settle)
        return
      }
      settle(null)
    }
    request.onblocked = () => {
      late = true
      heldBack = true
      settle(null)
    }
  })
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(SCANS)) {
    db.createObjectStore(SCANS, { keyPath: 'clientRequestId' })
  }
  // Added at version 2. An existing database is upgraded in place, so a
  // phone with scans already waiting keeps them.
  if (!db.objectStoreNames.contains(IDEAS)) {
    db.createObjectStore(IDEAS, { keyPath: 'id' })
  }
  // Version 3: checking yourself in by where you are. A farmhouse in the
  // Pyrenees with a hundred phones on one cell is exactly the case this
  // store exists for.
  if (!db.objectStoreNames.contains(HERE)) {
    db.createObjectStore(HERE, { keyPath: 'id' })
  }
  // Version 4: the gimcana. This one holds a Blob, which the other three do
  // not: a photograph is the whole point of a prova, and a queue that kept
  // the caption and threw the picture away would be worse than no queue.
  // Fifteen of them is tens of megabytes in IndexedDB, and that is the
  // price of «sense cobertura també funciona».
  if (!db.objectStoreNames.contains(PROVES)) {
    db.createObjectStore(PROVES, { keyPath: 'id' })
  }
}

/**
 * Keeps a connection, and lets go of it when somebody needs it to.
 *
 * `versionchange` is a newer tab asking to upgrade. Without closing here, that
 * tab is blocked for as long as this one stays open — which on a phone is
 * until somebody swipes it away — and it is the newer tab, the one with the
 * fixes, that cannot save. Closing costs this tab nothing: the next call opens
 * again, at the newer version (see `connect`).
 *
 * `close` is the browser dropping it without being asked: storage cleared
 * under pressure, which Safari does. Forgetting it is what makes the next call
 * reopen rather than throw on a dead handle.
 */
function adopt(db: IDBDatabase): IDBDatabase {
  // Two attempts can both succeed when an earlier one answered late.
  if (connection !== null && connection !== db) {
    db.close()
    return connection
  }
  connection = db
  const forget = () => {
    if (connection === db) connection = null
  }
  db.onversionchange = () => {
    db.close()
    forget()
  }
  db.onclose = forget
  return db
}

type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

/**
 * One request, answered when its transaction has committed.
 *
 * Not when the request succeeds: a write can succeed and the transaction
 * still abort afterwards — a full disk is reported at commit — and "saved"
 * has to mean it is on the disk.
 */
function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<Outcome<T>> {
  return open().then(
    (db) =>
      new Promise<Outcome<T>>((resolve) => {
        if (db === null) {
          resolve({ ok: false })
          return
        }
        let request: IDBRequest<T>
        let tx: IDBTransaction
        try {
          tx = db.transaction(storeName, mode)
          request = body(tx.objectStore(storeName))
        } catch {
          // A connection the browser closed under us. The next call reopens;
          // closing it first is what keeps that reopen from being blocked by
          // this very handle if it turns out to be alive after all.
          db.close()
          if (connection === db) connection = null
          resolve({ ok: false })
          return
        }
        tx.oncomplete = () => {
          resolve({ ok: true, value: request.result })
        }
        tx.onerror = () => {
          resolve({ ok: false })
        }
        tx.onabort = () => {
          resolve({ ok: false })
        }
      }),
  )
}

/**
 * It could not be written down, and it did not get through either.
 *
 * Every queue here promises the same thing — pressed with no signal, it goes
 * on its own later — and this is the case where that promise is false. A
 * screen that catches it says so and does not say "saved". Thrown by the
 * callers, not here: only they know whether the network got it anyway.
 */
export class NotSaved extends Error {
  constructor(cause: unknown) {
    super('it could not be written to the on-device queue, and it was not sent', { cause })
    this.name = 'NotSaved'
  }
}

/** Anything the queues hold: a key, when it happened, and how often it failed. */
export interface Queued {
  readonly at: number
  readonly tries: number
}

/**
 * Whether the queue can be written to at all, without writing anything.
 *
 * For a screen that wants to warn before it matters: a door with no signal and
 * no queue lets nobody in on the phone, and the junta should know that before
 * the first person is standing there, not after.
 */
export async function usable(): Promise<boolean> {
  return (await open()) !== null
}

/**
 * Writes a scan down. True only once it is on the disk.
 *
 * The answer is the point. `check_in` is safe to send whether or not this
 * worked, so a false here does not stop the scan; it stops the screen from
 * saying "queued" about something no flush is ever going to find.
 */
export async function enqueue(scan: QueuedScan): Promise<boolean> {
  return (await run(SCANS, 'readwrite', (store) => store.put(scan))).ok
}

export async function dequeue(clientRequestId: string): Promise<boolean> {
  return (await run(SCANS, 'readwrite', (store) => store.delete(clientRequestId))).ok
}

/** Oldest first: the door queue is a queue, not a stack. */
export async function pending(): Promise<QueuedScan[]> {
  const rows = await run<QueuedScan[]>(
    SCANS,
    'readonly',
    (store) => store.getAll() as IDBRequest<QueuedScan[]>,
  )
  return (rows.ok ? rows.value : []).sort((a, b) => a.at - b.at)
}

/**
 * Quantes files esperen en una cua.
 *
 * Per defecte la de l'escàner, que és qui la va demanar primer. El paràmetre hi
 * és perquè la de fitxatges també s'ha de poder comptar sense llegir-ne les
 * files senceres, i comptar és l'única cosa que en volem: `waiting()` porta la
 * posició i l'hora de cadascuna, que per a un rètol de «n pendents» és pes que
 * no fa cap feina.
 */
export async function count(storeName: string = SCANS): Promise<number> {
  const rows = await run<number>(storeName, 'readonly', (store) => store.count())
  return rows.ok ? rows.value : 0
}

/**
 * Un intent fallit més, només si l'entrada encara hi és.
 *
 * ABANS ERA UN `put` SENSE MIRAR, i això reviu entrades. Qui envia té la fila
 * a la mà des d'abans d'enviar; si mentrestant algú l'ha treta —«Desfés» a la
 * porta, que la treu i fa enrere el fitxatge al servidor—, el `put` del
 * fracàs la tornava a escriure, i el buidatge següent fitxava la persona de
 * nou, amb punts, amb la pantalla dient «fet enrere».
 *
 * Llegir i escriure dins de la mateixa transacció és el que ho fa segur: les
 * transaccions d'escriptura sobre un mateix magatzem no s'encavalquen, així
 * que entre el `get` i el `put` no hi cap cap `delete`.
 */
export async function bumpTries(scan: QueuedScan): Promise<void> {
  await change(scan.clientRequestId, (row) => ({ ...row, tries: row.tries + 1 }))
}

/**
 * Aparta una entrada que ja no s'ha d'enviar, o la hi torna.
 *
 * Amb la mateixa precaució que `bumpTries`: si mentrestant algú l'ha treta, no
 * es torna a escriure. `null` treu la marca, i l'entrada torna a sortir amb el
 * buidatge següent.
 */
export async function setHeld(clientRequestId: string, held: Held | null): Promise<void> {
  await change(clientRequestId, (row) => ({ ...row, held: held ?? undefined }))
}

/** Llegeix i reescriu una entrada de l'escàner dins d'una sola transacció, si hi és. */
async function change(
  clientRequestId: string,
  edit: (row: QueuedScan) => QueuedScan,
): Promise<void> {
  await run(SCANS, 'readwrite', (store) => {
    const current = store.get(clientRequestId) as IDBRequest<QueuedScan | undefined>
    // `addEventListener` i no `onsuccess`: `run` es queda aquell per resoldre.
    current.addEventListener('success', () => {
      const row = current.result
      if (row !== undefined) store.put(edit(row))
    })
    return current
  })
}

/**
 * Buida les quatre cues. Es crida en tancar la sessió, i no és neteja.
 *
 * TRES DE LES QUATRE NO PORTEN A DINS DE QUI SÓN. Un fitxatge per ubicació, una
 * idea i una prova de gimcana s'atribueixen amb `auth.uid()` en arribar al
 * servidor, no amb res que hi hagi a la fila. O sigui que en un telèfon
 * compartit —el de la porta, el d'algú que el deixa— una fila que sobreviu a un
 * canvi de sessió s'envia a nom de qui hi hagi ara: un fitxatge d'algú altre
 * atribuït a tu, en una activitat on potser no eres. És exactament el frau que
 * tot el disseny de la porta intenta evitar.
 *
 * La del l'escàner sí que porta a qui es fitxa, però es buida igualment: una
 * sola regla —una cua és de la sessió que la va fer— s'entén i es pot
 * comprovar, i quatre excepcions no. El preu és perdre escanejos si algú tanca
 * la sessió sense cobertura enmig d'una porta, que és una cosa que no fa ningú.
 */
export async function clearAllQueues(): Promise<void> {
  await Promise.all(
    [SCANS, IDEAS, HERE, PROVES].map((name) => run(name, 'readwrite', (store) => store.clear())),
  )
}

// ── the same three verbs, for any other store ───────────────────────────────

/** True only once it is on the disk. See `enqueue`. */
export async function put<T extends Queued>(storeName: string, item: T): Promise<boolean> {
  return (await run(storeName, 'readwrite', (store) => store.put(item))).ok
}

export async function drop(storeName: string, key: string): Promise<boolean> {
  return (await run(storeName, 'readwrite', (store) => store.delete(key))).ok
}

export async function waiting<T extends Queued>(storeName: string): Promise<T[]> {
  const rows = await run<T[]>(storeName, 'readonly', (store) => store.getAll() as IDBRequest<T[]>)
  return (rows.ok ? rows.value : []).sort((a, b) => a.at - b.at)
}

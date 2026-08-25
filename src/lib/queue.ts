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
}

let opening: Promise<IDBDatabase | null> | null = null

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    // Private browsing on iOS, a blocked-storage setting, or a browser that
    // simply refuses. A door with no queue still works, one scan at a time,
    // and that is a far better outcome than a screen that will not load.
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
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
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      resolve(null)
    }
    request.onblocked = () => {
      resolve(null)
    }
  })
  return opening
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (db === null) {
          resolve(null)
          return
        }
        let request: IDBRequest<T>
        try {
          request = body(db.transaction(storeName, mode).objectStore(storeName))
        } catch {
          resolve(null)
          return
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          resolve(null)
        }
      }),
  )
}

/** Anything the queues hold: a key, when it happened, and how often it failed. */
export interface Queued {
  readonly at: number
  readonly tries: number
}

export async function enqueue(scan: QueuedScan): Promise<void> {
  await run(SCANS, 'readwrite', (store) => store.put(scan))
}

export async function dequeue(clientRequestId: string): Promise<void> {
  await run(SCANS, 'readwrite', (store) => store.delete(clientRequestId))
}

/** Oldest first: the door queue is a queue, not a stack. */
export async function pending(): Promise<QueuedScan[]> {
  const rows = await run<QueuedScan[]>(
    SCANS,
    'readonly',
    (store) => store.getAll() as IDBRequest<QueuedScan[]>,
  )
  return (rows ?? []).sort((a, b) => a.at - b.at)
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
  return (await run<number>(storeName, 'readonly', (store) => store.count())) ?? 0
}

export async function bumpTries(scan: QueuedScan): Promise<void> {
  await enqueue({ ...scan, tries: scan.tries + 1 })
}

/** For the tests. Signing out uses clearAllQueues(), which includes this one. */
export async function clearQueue(): Promise<void> {
  await run(SCANS, 'readwrite', (store) => store.clear())
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

export async function put<T extends Queued>(storeName: string, item: T): Promise<void> {
  await run(storeName, 'readwrite', (store) => store.put(item))
}

export async function drop(storeName: string, key: string): Promise<void> {
  await run(storeName, 'readwrite', (store) => store.delete(key))
}

export async function waiting<T extends Queued>(storeName: string): Promise<T[]> {
  const rows = await run<T[]>(storeName, 'readonly', (store) => store.getAll() as IDBRequest<T[]>)
  return (rows ?? []).sort((a, b) => a.at - b.at)
}

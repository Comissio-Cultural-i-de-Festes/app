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
const DB_VERSION = 1
const STORE = 'checkin-queue'

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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientRequestId' })
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
          request = body(db.transaction(STORE, mode).objectStore(STORE))
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

export async function enqueue(scan: QueuedScan): Promise<void> {
  await run('readwrite', (store) => store.put(scan))
}

export async function dequeue(clientRequestId: string): Promise<void> {
  await run('readwrite', (store) => store.delete(clientRequestId))
}

/** Oldest first: the door queue is a queue, not a stack. */
export async function pending(): Promise<QueuedScan[]> {
  const rows = await run<QueuedScan[]>(
    'readonly',
    (store) => store.getAll() as IDBRequest<QueuedScan[]>,
  )
  return (rows ?? []).sort((a, b) => a.at - b.at)
}

export async function count(): Promise<number> {
  return (await run<number>('readonly', (store) => store.count())) ?? 0
}

export async function bumpTries(scan: QueuedScan): Promise<void> {
  await enqueue({ ...scan, tries: scan.tries + 1 })
}

/** For the tests, and for signing out on a shared phone. */
export async function clearQueue(): Promise<void> {
  await run('readwrite', (store) => store.clear())
}

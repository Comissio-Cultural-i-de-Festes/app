/**
 * Prou IndexedDB per a `src/lib/queue.ts`, i res més.
 *
 * jsdom no en porta, i sense això `queue.ts` es queda a la branca de «no hi ha
 * on desar» i qualsevol prova de la cua passa perquè no fa res. El que imita
 * és el que la cua fa servir: obrir amb versió, crear magatzems, i les sis
 * operacions, cadascuna asíncrona i en ordre, amb `onsuccess` i
 * `addEventListener('success')` com el navegador. No hi ha índexs, cursors ni
 * errors, perquè la cua no en fa servir cap.
 *
 * No és una dependència, a posta: una de nova només per a proves no s'ha
 * guanyat el lloc mentre això càpiga en una pantalla.
 */

type Listener = () => void

class FakeRequest<T> {
  result: T | undefined
  onsuccess: Listener | null = null
  onerror: Listener | null = null
  private readonly listeners: Listener[] = []

  addEventListener(type: string, listener: Listener): void {
    if (type === 'success') this.listeners.push(listener)
  }

  succeed(result: T): void {
    this.result = result
    for (const listener of this.listeners) listener()
    this.onsuccess?.()
  }
}

class FakeStore {
  private readonly rows: Map<string, unknown>
  private readonly keyPath: string

  constructor(rows: Map<string, unknown>, keyPath: string) {
    this.rows = rows
    this.keyPath = keyPath
  }

  private later<T>(work: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>()
    queueMicrotask(() => {
      request.succeed(work())
    })
    return request
  }

  put(value: Record<string, unknown>) {
    const copy = structuredClone(value)
    return this.later(() => {
      this.rows.set(String(copy[this.keyPath]), copy)
      return copy[this.keyPath]
    })
  }

  get(key: string) {
    return this.later(() => structuredClone(this.rows.get(key)))
  }

  delete(key: string) {
    return this.later(() => {
      this.rows.delete(key)
      return undefined
    })
  }

  getAll() {
    return this.later(() => [...this.rows.values()].map((row) => structuredClone(row)))
  }

  count() {
    return this.later(() => this.rows.size)
  }

  clear() {
    return this.later(() => {
      this.rows.clear()
      return undefined
    })
  }
}

class FakeDatabase {
  readonly stores = new Map<string, { keyPath: string; rows: Map<string, unknown> }>()
  version = 0

  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }

  createObjectStore(name: string, options: { keyPath: string }): void {
    this.stores.set(name, { keyPath: options.keyPath, rows: new Map() })
  }

  transaction(name: string) {
    const store = this.stores.get(name)
    if (store === undefined) throw new Error(`no store ${name}`)
    return { objectStore: () => new FakeStore(store.rows, store.keyPath) }
  }
}

export function installFakeIndexedDb(): void {
  const databases = new Map<string, FakeDatabase>()

  const factory = {
    open(name: string, version: number) {
      const request = new FakeRequest<FakeDatabase>() as FakeRequest<FakeDatabase> & {
        onupgradeneeded: Listener | null
        onblocked: Listener | null
      }
      request.onupgradeneeded = null
      request.onblocked = null
      queueMicrotask(() => {
        const db = databases.get(name) ?? new FakeDatabase()
        databases.set(name, db)
        request.result = db
        if (version > db.version) {
          db.version = version
          request.onupgradeneeded?.()
        }
        request.succeed(db)
      })
      return request
    },
  }

  Object.defineProperty(globalThis, 'indexedDB', { value: factory, configurable: true })
}

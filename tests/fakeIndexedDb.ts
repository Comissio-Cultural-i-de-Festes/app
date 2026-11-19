/**
 * Prou IndexedDB per a `src/lib/queue.ts`, i res més.
 *
 * jsdom no en porta, i sense això `queue.ts` es queda a la branca de «no hi ha
 * on desar» i qualsevol prova de la cua passa perquè no fa res. El que imita
 * és el que la cua fa servir: obrir amb versió, crear magatzems, les sis
 * operacions, cadascuna asíncrona i en ordre, amb `onsuccess` i
 * `addEventListener('success')` com el navegador, i la transacció que acaba
 * amb `oncomplete` quan no li queda res per fer. No hi ha índexs ni cursors,
 * perquè la cua no en fa servir cap.
 *
 * I ELS CAMINS DOLENTS DE L'OBERTURA, que són els que deixaven la cua callada
 * per a tota la vida de la pàgina: una obertura que falla, una que no contesta
 * fins que la prova ho diu, obertures que esperen en fila, i una versió nova
 * que ha d'esperar que una connexió vella es tanqui (`versionchange` a la
 * vella, `blocked` a la nova si la vella no plega). Més l'escriptura que el
 * disc refusa. Es demanen amb el que torna
 * `installFakeIndexedDb()`; qui no demana res té l'IndexedDB de sempre.
 *
 * No és una dependència, a posta: una de nova només per a proves no s'ha
 * guanyat el lloc mentre això càpiga en una pantalla.
 */

type Listener = () => void

class FakeRequest<T> {
  result: T | undefined
  error: { name: string } | null = null
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

  fail(name: string): void {
    this.error = { name }
    this.onerror?.()
  }
}

class FakeTransaction {
  oncomplete: Listener | null = null
  onerror: Listener | null = null
  onabort: Listener | null = null
  private open = 0
  private failed = false
  private readonly store: FakeStore
  private readonly refuseWrites: boolean

  constructor(rows: Map<string, unknown>, keyPath: string, refuseWrites: boolean) {
    this.store = new FakeStore(this, rows, keyPath)
    this.refuseWrites = refuseWrites
  }

  objectStore(): FakeStore {
    return this.store
  }

  /** Una operació més dins d'aquesta transacció, que s'acaba quan totes han acabat. */
  later<T>(work: () => T, write: boolean): FakeRequest<T> {
    const request = new FakeRequest<T>()
    this.open += 1
    queueMicrotask(() => {
      if (this.failed) return
      if (write && this.refuseWrites) {
        this.failed = true
        request.fail('QuotaExceededError')
        this.onerror?.()
        this.onabort?.()
        return
      }
      request.succeed(work())
      this.open -= 1
      if (this.open === 0) {
        // Una microtasca més: una operació encadenada dins d'un `success`
        // (`bumpTries`) encara hi és a temps, com al navegador.
        queueMicrotask(() => {
          if (this.open === 0 && !this.failed) this.oncomplete?.()
        })
      }
    })
    return request
  }
}

class FakeStore {
  private readonly tx: FakeTransaction
  private readonly rows: Map<string, unknown>
  private readonly keyPath: string

  constructor(tx: FakeTransaction, rows: Map<string, unknown>, keyPath: string) {
    this.tx = tx
    this.rows = rows
    this.keyPath = keyPath
  }

  put(value: Record<string, unknown>) {
    const copy = structuredClone(value)
    return this.tx.later(() => {
      this.rows.set(String(copy[this.keyPath]), copy)
      return copy[this.keyPath]
    }, true)
  }

  get(key: string) {
    return this.tx.later(() => structuredClone(this.rows.get(key)), false)
  }

  delete(key: string) {
    return this.tx.later(() => {
      this.rows.delete(key)
      return undefined
    }, true)
  }

  getAll() {
    return this.tx.later(() => [...this.rows.values()].map((row) => structuredClone(row)), false)
  }

  count() {
    return this.tx.later(() => this.rows.size, false)
  }

  clear() {
    return this.tx.later(() => {
      this.rows.clear()
      return undefined
    }, true)
  }
}

/** El que hi ha al disc, compartit per totes les connexions a una base. */
class Backing {
  readonly stores = new Map<string, { keyPath: string; rows: Map<string, unknown> }>()
  version = 0
  readonly connections = new Set<FakeConnection>()
  /** Obertures que esperen que les connexions velles es tanquin. */
  readonly waiters: Listener[] = []
}

class FakeConnection {
  onversionchange: Listener | null = null
  onclose: Listener | null = null
  closed = false

  private readonly backing: Backing
  private readonly control: FakeControl

  readonly objectStoreNames = {
    contains: (name: string) => this.backing.stores.has(name),
  }

  constructor(backing: Backing, control: FakeControl) {
    this.backing = backing
    this.control = control
    backing.connections.add(this)
  }

  get version(): number {
    return this.backing.version
  }

  createObjectStore(name: string, options: { keyPath: string }): void {
    this.backing.stores.set(name, { keyPath: options.keyPath, rows: new Map() })
  }

  transaction(name: string) {
    // Com el navegador: una connexió tancada no obre transaccions, llança.
    if (this.closed) throw new Error('InvalidStateError: the connection is closed')
    const store = this.backing.stores.get(name)
    if (store === undefined) throw new Error(`NotFoundError: no store ${name}`)
    return new FakeTransaction(store.rows, store.keyPath, this.control.refuseWrites)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.backing.connections.delete(this)
    for (const wake of this.backing.waiters.splice(0)) wake()
  }
}

/** El que una prova pot fer anar malament. */
export interface FakeControl {
  /** Les properes `n` obertures fallen amb aquest nom d'error. */
  failOpens: (n: number, name?: string) => void
  /** Les properes `n` obertures no contesten fins que es crida `release()`. */
  hangOpens: (n: number) => void
  /** Deixa anar les obertures penjades, que continuen com si res. */
  release: () => void
  /** Mentre valgui `true`, tota escriptura acaba en error i avorta la transacció. */
  refuseWrites: boolean
  /** Quantes vegades s'ha cridat `indexedDB.open`. */
  opens: number
}

type OpenRequest = FakeRequest<FakeConnection> & {
  onupgradeneeded: Listener | null
  onblocked: Listener | null
}

export function installFakeIndexedDb(): FakeControl {
  const databases = new Map<string, Backing>()
  /**
   * Les obertures d'una mateixa base van una darrere l'altra, com al
   * navegador: la següent no comença fins que l'anterior ha acabat, bé o malament.
   * Una que es penja, o que espera bloquejada, deixa penjades les de darrere.
   */
  const tails = new Map<string, Promise<void>>()
  let failing = { n: 0, name: 'UnknownError' }
  let hanging = 0
  const unhang: Listener[] = []

  const control: FakeControl = {
    failOpens: (n, name = 'UnknownError') => {
      failing = { n, name }
    },
    hangOpens: (n) => {
      hanging = n
    },
    release: () => {
      for (const go of unhang.splice(0)) go()
    },
    refuseWrites: false,
    opens: 0,
  }

  const factory = {
    open(name: string, version?: number) {
      control.opens += 1
      const request = new FakeRequest<FakeConnection>() as OpenRequest
      request.onupgradeneeded = null
      request.onblocked = null

      const hangs = hanging > 0
      if (hangs) hanging -= 1
      const fails = failing.n > 0 ? failing.name : null
      if (fails !== null) failing.n -= 1

      let done!: Listener
      const mine = new Promise<void>((resolve) => {
        done = resolve
      })
      const previous = tails.get(name) ?? Promise.resolve()
      tails.set(
        name,
        previous.then(() => mine),
      )

      void previous
        .then(() =>
          hangs
            ? new Promise<void>((resolve) => {
                unhang.push(resolve)
              })
            : undefined,
        )
        .then(() => {
          if (fails !== null) {
            request.fail(fails)
            done()
            return
          }
          const db = databases.get(name) ?? new Backing()
          databases.set(name, db)
          const target = version ?? Math.max(db.version, 1)
          if (target < db.version) {
            request.fail('VersionError')
            done()
            return
          }

          const finish = () => {
            const connection = new FakeConnection(db, control)
            request.result = connection
            if (target > db.version) {
              db.version = target
              request.onupgradeneeded?.()
            }
            request.succeed(connection)
            done()
          }

          if (target === db.version || db.connections.size === 0) {
            finish()
            return
          }

          // Una versió nova amb connexions obertes: primer se'ls demana que
          // plegin, i si alguna no ho fa, la nova espera bloquejada fins que ho faci.
          for (const connection of [...db.connections]) connection.onversionchange?.()
          if (db.connections.size === 0) {
            finish()
            return
          }
          request.onblocked?.()
          const wait = () => {
            if (db.connections.size === 0) finish()
            else db.waiters.push(wait)
          }
          db.waiters.push(wait)
        })
      return request
    },
  }

  Object.defineProperty(globalThis, 'indexedDB', { value: factory, configurable: true })
  return control
}

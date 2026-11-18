import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { anonClient, as, F, rpc, serviceClient } from './helpers'

/**
 * Esborrar la foto que se substitueix, a través de l'API de Storage (#42).
 *
 * El client deixa a cada carpeta només l'objecte que la fila fa servir
 * (`keepOnly` a `src/lib/storage.ts`): llista la carpeta i esborra la resta.
 * Això depèn de dues polítiques per bucket —poder llistar la carpeta i poder
 * esborrar-hi— que pgTAP no pot provar, perquè `storage.protect_delete()`
 * refusa qualsevol DELETE des de SQL. I l'altra meitat: que ningú no pugui fer
 * el mateix a la carpeta d'un altre.
 *
 * I l'escombrada diària (`sweepStorage`): el que `my_storage_garbage` torna a
 * cadascú ha de ser exactament el que l'API li deixarà esborrar.
 *
 * Un esborrat que RLS filtra no és cap error: Storage torna 200 amb una llista
 * buida. Per això cada «no» es comprova mirant que l'objecte encara hi és, i no
 * pel codi.
 *
 * Re-executable: noms frescos a cada passada, i cap suposició sobre què hi
 * havia a la carpeta abans.
 */

const body = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' })
const stamp = () => `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`

async function exists(bucket: string, path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf('/'))
  const name = path.slice(path.lastIndexOf('/') + 1)
  const { data } = await serviceClient().storage.from(bucket).list(folder, { search: name })
  return (data ?? []).some((o) => o.name === name)
}

/** El que fa `keepOnly`, amb el client de qui toca. */
async function keepOnlyAs(
  client: Awaited<ReturnType<typeof as>>,
  bucket: string,
  folder: string,
  keep: string,
): Promise<string[]> {
  const { data, error } = await client.storage.from(bucket).list(folder, { limit: 1000 })
  expect(error).toBeNull()
  const stale = (data ?? [])
    .filter((o) => o.id !== null)
    .map((o) => `${folder}/${o.name}`)
    .filter((p) => p !== keep)
  if (stale.length === 0) return []
  const removed = await client.storage.from(bucket).remove(stale)
  expect(removed.error).toBeNull()
  return (removed.data ?? []).map((o) => o.name)
}

describe('avatars: canviar-la deixa només la nova', () => {
  const BUCKET = 'avatars'

  it('el soci llista la seva carpeta i n’esborra la vella', async () => {
    const alfa = await as('alfa')
    const old = `${F.alfa}/${stamp()}.jpg`
    const neu = `${F.alfa}/${stamp()}9.jpg`
    expect((await alfa.storage.from(BUCKET).upload(old, body())).error).toBeNull()
    expect((await alfa.storage.from(BUCKET).upload(neu, body())).error).toBeNull()

    const removed = await keepOnlyAs(alfa, BUCKET, F.alfa, neu)

    expect(removed).toContain(old)
    expect(await exists(BUCKET, old)).toBe(false)
    expect(await exists(BUCKET, neu)).toBe(true)
  })

  it('però no pot esborrar l’avatar d’un altre', async () => {
    const bravo = await as('bravo')
    const theirs = `${F.bravo}/${stamp()}.jpg`
    expect((await bravo.storage.from(BUCKET).upload(theirs, body())).error).toBeNull()

    const alfa = await as('alfa')
    const { data } = await alfa.storage.from(BUCKET).remove([theirs])

    expect(data ?? []).toHaveLength(0)
    expect(await exists(BUCKET, theirs)).toBe(true)
  })

  it('ni la junta, que no té cap pantalla que ho demani', async () => {
    const bravo = await as('bravo')
    const theirs = `${F.bravo}/${stamp()}.jpg`
    expect((await bravo.storage.from(BUCKET).upload(theirs, body())).error).toBeNull()

    const junta = await as('junta_alfa')
    await junta.storage.from(BUCKET).remove([theirs])

    expect(await exists(BUCKET, theirs)).toBe(true)
  })
})

describe('portades: la junta substitueix i esborra, un soci no', () => {
  const BUCKET = 'event-covers'

  it('la junta deixa a la carpeta de l’esdeveniment només la portada nova', async () => {
    const junta = await as('junta_alfa')
    const folder = crypto.randomUUID()
    const old = `${folder}/${stamp()}.jpg`
    const neu = `${folder}/${stamp()}9.jpg`
    expect((await junta.storage.from(BUCKET).upload(old, body())).error).toBeNull()
    expect((await junta.storage.from(BUCKET).upload(neu, body())).error).toBeNull()

    await keepOnlyAs(junta, BUCKET, folder, neu)

    expect(await exists(BUCKET, old)).toBe(false)
    expect(await exists(BUCKET, neu)).toBe(true)
  })

  it('i un soci no en pot esborrar cap', async () => {
    const junta = await as('junta_alfa')
    const cover = `${crypto.randomUUID()}/${stamp()}.jpg`
    expect((await junta.storage.from(BUCKET).upload(cover, body())).error).toBeNull()

    const alfa = await as('alfa')
    const { data } = await alfa.storage.from(BUCKET).remove([cover])

    expect(data ?? []).toHaveLength(0)
    expect(await exists(BUCKET, cover)).toBe(true)
  })
})

describe('selfies de la porta: refer-la treu l’anterior', () => {
  const BUCKET = 'door-photos'
  let attended = ''

  beforeAll(async () => {
    const { data } = await serviceClient()
      .from('attendances')
      .select('event_id')
      .eq('user_id', F.alfa)
      .eq('estado', 'asistio')
      .limit(1)
    attended = data?.[0]?.event_id ?? ''
    expect(attended).not.toBe('')
  })

  it.each(['entrada', 'sortida'])('la de %s: el soci n’esborra la vella', async (kind) => {
    const alfa = await as('alfa')
    const folder = `${kind}/${attended}/${F.alfa}`
    const old = `${folder}/${stamp()}.jpg`
    const neu = `${folder}/${stamp()}9.jpg`
    expect((await alfa.storage.from(BUCKET).upload(old, body())).error).toBeNull()
    expect((await alfa.storage.from(BUCKET).upload(neu, body())).error).toBeNull()

    await keepOnlyAs(alfa, BUCKET, folder, neu)

    expect(await exists(BUCKET, old)).toBe(false)
    expect(await exists(BUCKET, neu)).toBe(true)
  })

  it('i un altre soci no pot tocar les seves', async () => {
    const alfa = await as('alfa')
    const mine = `sortida/${attended}/${F.alfa}/${stamp()}.jpg`
    expect((await alfa.storage.from(BUCKET).upload(mine, body())).error).toBeNull()

    const bravo = await as('bravo')
    const { data } = await bravo.storage.from(BUCKET).remove([mine])

    expect(data ?? []).toHaveLength(0)
    expect(await exists(BUCKET, mine)).toBe(true)
  })
})

describe('l’escombrada: cadascú treu la brossa que les seves polítiques li deixen', () => {
  const BUCKET = 'gimcana-photos'
  const made: string[] = []

  // L'esdeveniment se'n va en acabar, i la gimcana i la prova amb ell: és un
  // esborrany vell que si no comptaria a qualsevol altre test que conti
  // esdeveniments. La foto que quedi és brossa de debò i la recull l'escombrada.
  afterAll(async () => {
    if (made.length > 0) await serviceClient().from('events').delete().in('id', made)
  })

  /** Una gimcana nova a cada passada, tancada fa quaranta dies. */
  async function oldGimcanaPhoto(): Promise<string> {
    const svc = serviceClient()
    const event = crypto.randomUUID()
    const gimcana = crypto.randomUUID()
    const prova = crypto.randomUUID()
    const starts = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    made.push(event)

    expect(
      (await svc.from('events').insert({ id: event, tipo: 'fiesta', starts_at: starts })).error,
    ).toBeNull()
    expect((await svc.from('gimcanes').insert({ id: gimcana, event_id: event })).error).toBeNull()
    expect(
      (
        await svc
          .from('gimcana_proves')
          .insert({ id: prova, gimcana_id: gimcana, titol: 'Una prova inventada vella' })
      ).error,
    ).toBeNull()

    // Pujada pel soci, com ho fa l'app: la política d'insert és seva.
    const alfa = await as('alfa')
    const path = `${prova}/${F.alfa}/${stamp()}.jpg`
    expect((await alfa.storage.from(BUCKET).upload(path, body())).error).toBeNull()
    return path
  }

  it('la prova d’una gimcana vençuda surt a la junta, i la junta la treu', async () => {
    const path = await oldGimcanaPhoto()

    const junta = await as('junta_alfa')
    const { data, error } = await rpc<{ bucket: string; path: string }[]>(
      junta,
      'my_storage_garbage',
      { p_limit: 100000 },
    )
    expect(error).toBeNull()
    expect(data).toContainEqual({ bucket: BUCKET, path })

    const removed = await junta.storage.from(BUCKET).remove([path])
    expect(removed.error).toBeNull()
    expect(await exists(BUCKET, path)).toBe(false)
  })

  it('però no surt al soci que la va enviar, que no la pot esborrar', async () => {
    const path = await oldGimcanaPhoto()

    const alfa = await as('alfa')
    const { data, error } = await rpc<{ bucket: string; path: string }[]>(
      alfa,
      'my_storage_garbage',
      { p_limit: 100000 },
    )
    expect(error).toBeNull()
    expect(data ?? []).not.toContainEqual({ bucket: BUCKET, path })

    // I és veritat que no pot: la política d'esborrar és de la junta.
    await alfa.storage.from(BUCKET).remove([path])
    expect(await exists(BUCKET, path)).toBe(true)
  })

  it('anon no hi pot preguntar', async () => {
    const { error } = await rpc(anonClient(), 'my_storage_garbage', { p_limit: 1 })
    expect(error?.code).toBe('42501')
  })
})

describe('la cua de validar diu si la foto ja no hi és', () => {
  it('torna la columna a la junta', async () => {
    // Sense files també val: PostgREST munta el `select` sobre la funció, i
    // una columna que no hi fos seria un 42703 encara que la cua fos buida.
    const junta = await as('junta_alfa')
    const { error } = await junta
      .rpc('admin_gimcana_queue', { p_event_id: F.e1 })
      .select('id, foto_esborrada_at')
    expect(error).toBeNull()
  })
})

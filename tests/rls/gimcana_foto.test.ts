import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { as, F, rpc, serviceClient } from './helpers'

/**
 * La foto d'una prova de la gimcana, per Kong i amb dos tokens de debò.
 *
 * Fins a la migració 95, `submit_prova` desava el camí tal com arribava: la
 * política del bucket obliga que cadascú pugi a la seva carpeta, però res no
 * lligava la pujada amb l'enviament. L'alfa podia enviar la prova amb el camí
 * d'una foto que havia pujat el bravo, i la junta la veia i la validava. La
 * pgTAP ho prova amb files escrites a `storage.objects`; aquí la foto la puja
 * de debò l'API d'storage, i el refús arriba com el rebria la pantalla: un
 * 22023 amb la pista `prova_foto`, i no una llista buida.
 *
 * REEXECUTABLE: una activitat nova a cada execució, i noms de foto nous. Al
 * final s'esborren les fotos per l'API (la base no deixa fer-ho per SQL) i
 * l'activitat, que s'emporta la gimcana i els enviaments.
 */

const EVENT = randomUUID()
const BUCKET = 'gimcana-photos'
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9,
])

let prova = ''
const pujades: string[] = []

async function puja(handle: string, path: string) {
  const client = await as(handle)
  const res = await client.storage.from(BUCKET).upload(path, JPEG, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (!res.error) pujades.push(path)
  return res
}

const cami = (user: string, id = randomUUID()) => `${prova}/${user}/${id}.jpg`

describe('la foto d’una prova és de qui l’envia', () => {
  beforeAll(async () => {
    const svc = serviceClient()
    const ev = await svc
      .from('events')
      .insert({
        id: EVENT,
        tipo: 'fiesta',
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        puntos: 10,
        published: true,
      })
      .select('id')
    expect(ev.error).toBeNull()
    await svc.from('event_title').insert({ event_id: EVENT, titulo: 'Gimcana inventada de prova' })
    await svc
      .from('event_details')
      .insert({ event_id: EVENT, ends_at: new Date(Date.now() + 4 * 3_600_000).toISOString() })

    const junta = await as('junta_alfa')
    const saved = await rpc<{ estat: string }>(junta, 'admin_save_gimcana', {
      p_event_id: EVENT,
      p_mena_equips: 'escoles',
      p_proves: [{ titol: 'Una prova inventada', punts: 10, ordre: 1 }],
    })
    expect(saved.error).toBeNull()

    const row = await svc
      .from('gimcana_proves')
      .select('id, gimcanes!inner(event_id)')
      .eq('gimcanes.event_id', EVENT)
      .single()
    expect(row.error).toBeNull()
    prova = row.data!.id
  })

  afterAll(async () => {
    const svc = serviceClient()
    if (pujades.length > 0) {
      const removed = await svc.storage.from(BUCKET).remove(pujades)
      expect(removed.error).toBeNull()
    }
    // Una activitat oberta que es quedés aquí entraria a la finestra de la
    // porta i del rebedor de la junta a la resta del suite.
    const gone = await svc.from('events').delete().eq('id', EVENT).select('id')
    expect(gone.error).toBeNull()
    expect(gone.data).toHaveLength(1)
  })

  it('l’alfa no pot enviar la prova amb la foto que ha pujat el bravo', async () => {
    const delBravo = cami(F.bravo)
    expect((await puja('bravo', delBravo)).error).toBeNull()

    const alfa = await as('alfa')
    const { data, error } = await rpc(alfa, 'submit_prova', {
      p_prova_id: prova,
      p_path: delBravo,
      p_client_request_id: randomUUID(),
    })

    expect(data).toBeNull()
    expect(error?.code).toBe('22023')
    expect(error?.hint).toBe('prova_foto')
  })

  it('ni pujar-la ell mateix a la carpeta del bravo, que és l’altra meitat', async () => {
    // L'API d'storage respon 400 i porta el 403 de la política a `statusCode`.
    const { error } = await puja('alfa', cami(F.bravo))
    expect(error).toMatchObject({ statusCode: '403' })
    expect(error?.message).toMatch(/row-level security/)
  })

  it('ni enviar un camí seu amb la forma bona que mai ha pujat', async () => {
    const alfa = await as('alfa')
    const { error } = await rpc(alfa, 'submit_prova', {
      p_prova_id: prova,
      p_path: cami(F.alfa),
      p_client_request_id: randomUUID(),
    })

    expect(error?.code).toBe('22023')
    expect(error?.hint).toBe('prova_foto')
  })

  it('i amb la seva foto, com la puja l’app, entra i la junta la veu', async () => {
    const id = randomUUID()
    const seva = cami(F.alfa, id)
    expect((await puja('alfa', seva)).error).toBeNull()

    const alfa = await as('alfa')
    const sent = await rpc<{ estat: string }>(alfa, 'submit_prova', {
      p_prova_id: prova,
      p_path: seva,
      p_client_request_id: id,
    })
    expect(sent.error).toBeNull()
    expect(sent.data?.estat).toBe('enviada')

    const junta = await as('junta_alfa')
    const cua = await rpc<{ path: string; qui: string }[]>(junta, 'admin_gimcana_queue', {
      p_event_id: EVENT,
    })
    expect(cua.error).toBeNull()
    const paths = (cua.data ?? []).map((r) => r.path)
    expect(paths).toContain(seva)
    expect(paths.some((p) => p.includes(`/${F.bravo}/`))).toBe(false)
  })
})

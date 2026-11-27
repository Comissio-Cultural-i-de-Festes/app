import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { as, F, rpc, serviceClient } from './helpers'

/**
 * Els equips de la gimcana, per Kong, amb tokens de debò i tots alhora.
 *
 * La casa rural (novembre del 2026) va posar tothom al primer equip: quaranta
 * mòbils obrint la gimcana el mateix minut veien tots els equips buits, perquè
 * cap transacció veu les files de les altres fins al commit. Des d'una sola
 * transacció de pgTAP això no es pot reproduir; aquí sí: sis socis criden
 * `gimcana_for_event` a la vegada i es mira on ha caigut cadascú.
 *
 * I el mode junta per la porta de debò: ningú no cau sol, la junta posa la
 * gent amb `admin_set_team`, i un soci que ho intenta rep un 42501, no una
 * resposta buida que sembli un èxit.
 *
 * REEXECUTABLE: dues activitats noves a cada execució, que al final
 * s'esborren i s'emporten gimcanes, equips i membres.
 */

const SORTEIG = randomUUID()
const JUNTA = randomUUID()
const SIS = ['alfa', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'] as const

async function activitat(id: string, mena: string, equips: readonly string[]): Promise<string> {
  const svc = serviceClient()
  const ev = await svc
    .from('events')
    .insert({
      id,
      tipo: 'fiesta',
      starts_at: new Date(Date.now() - 3_600_000).toISOString(),
      puntos: 10,
      published: true,
    })
    .select('id')
  expect(ev.error).toBeNull()
  await svc.from('event_title').insert({ event_id: id, titulo: 'Gimcana inventada d’equips' })
  await svc
    .from('event_details')
    .insert({ event_id: id, ends_at: new Date(Date.now() + 4 * 3_600_000).toISOString() })

  const junta = await as('junta_alfa')
  const saved = await rpc<{ estat: string; id: string }>(junta, 'admin_save_gimcana', {
    p_event_id: id,
    p_mena_equips: mena,
    p_proves: [{ titol: 'Una prova inventada', punts: 10, ordre: 1 }],
  })
  expect(saved.error).toBeNull()
  const gimcana = saved.data!.id

  const teams = await rpc<{ estat: string }>(junta, 'admin_save_teams', {
    p_gimcana_id: gimcana,
    p_noms: equips,
  })
  expect(teams.data?.estat).toBe('desats')
  return gimcana
}

async function membres(gimcana: string): Promise<Map<string, string>> {
  const svc = serviceClient()
  const res = await svc
    .from('gimcana_membres')
    .select('user_id, equip_id')
    .eq('gimcana_id', gimcana)
  expect(res.error).toBeNull()
  return new Map((res.data ?? []).map((r) => [r.user_id, r.equip_id]))
}

afterAll(async () => {
  const svc = serviceClient()
  const gone = await svc.from('events').delete().in('id', [SORTEIG, JUNTA]).select('id')
  expect(gone.error).toBeNull()
})

describe('en sorteig, obrir la gimcana tots alhora', () => {
  let gimcana = ''

  beforeAll(async () => {
    gimcana = await activitat(SORTEIG, 'sorteig', ['Blau', 'Verd', 'Groc'])
  })

  it('reparteix la gent entre els equips, i no tothom al primer', async () => {
    const clients = await Promise.all(SIS.map((h) => as(h)))
    const results = await Promise.all(
      clients.map((c) => rpc<{ estat: string }>(c, 'gimcana_for_event', { p_event_id: SORTEIG })),
    )
    for (const r of results) expect(r.error).toBeNull()

    const qui = await membres(gimcana)
    expect(qui.size).toBe(SIS.length)

    const perEquip = new Map<string, number>()
    for (const equip of qui.values()) perEquip.set(equip, (perEquip.get(equip) ?? 0) + 1)
    // Sis persones i tres equips: dos a cada un. Sense el bloqueig eren sis a
    // l'equip 1 i zero als altres dos.
    expect([...perEquip.values()].sort()).toEqual([2, 2, 2])
  })
})

describe('en mode junta', () => {
  let gimcana = ''
  let blau = ''

  beforeAll(async () => {
    gimcana = await activitat(JUNTA, 'junta', ['Blau', 'Verd'])
    const svc = serviceClient()
    const e = await svc
      .from('gimcana_equips')
      .select('id')
      .eq('gimcana_id', gimcana)
      .eq('ordre', 1)
      .single()
    blau = e.data!.id
  })

  it('obrir la gimcana tots alhora no posa ningú en cap equip', async () => {
    const clients = await Promise.all(SIS.map((h) => as(h)))
    const results = await Promise.all(
      clients.map((c) =>
        rpc<{ estat: string; equip: unknown }>(c, 'gimcana_for_event', { p_event_id: JUNTA }),
      ),
    )
    for (const r of results) {
      expect(r.error).toBeNull()
      expect(r.data?.equip).toBeNull()
    }
    expect((await membres(gimcana)).size).toBe(0)
  })

  it('un soci no es pot posar en un equip per la porta de la junta', async () => {
    const bravo = await as('bravo')
    const res = await rpc(bravo, 'admin_set_team', {
      p_gimcana_id: gimcana,
      p_user_id: F.bravo,
      p_equip_id: blau,
    })
    expect(res.error?.code).toBe('42501')
  })

  it('ni escrivint a la taula directament', async () => {
    const bravo = await as('bravo')
    const res = await bravo
      .from('gimcana_membres')
      .insert({ gimcana_id: gimcana, user_id: F.bravo, equip_id: blau })
    expect(res.error?.code).toBe('42501')
  })

  it('ni veure la llista de la junta', async () => {
    const bravo = await as('bravo')
    const res = await rpc(bravo, 'admin_gimcana_people', { p_gimcana_id: gimcana })
    expect(res.error?.code).toBe('42501')
  })

  it('la junta el posa, i la gimcana li diu amb qui juga i quin número té', async () => {
    const junta = await as('junta_alfa')
    const set = await rpc<{ estat: string }>(junta, 'admin_set_team', {
      p_gimcana_id: gimcana,
      p_user_id: F.alfa,
      p_equip_id: blau,
    })
    expect(set.data?.estat).toBe('fet')

    const alfa = await as('alfa')
    const view = await rpc<{ equip: { id: string; nom: string; ordre: number } | null }>(
      alfa,
      'gimcana_for_event',
      { p_event_id: JUNTA },
    )
    expect(view.data?.equip?.id).toBe(blau)
    expect(view.data?.equip?.ordre).toBe(1)
  })

  it('i el treu sense enviar cap equip', async () => {
    const junta = await as('junta_alfa')
    const set = await rpc<{ estat: string }>(junta, 'admin_set_team', {
      p_gimcana_id: gimcana,
      p_user_id: F.alfa,
    })
    expect(set.data?.estat).toBe('fet')
    expect((await membres(gimcana)).has(F.alfa)).toBe(false)
  })
})

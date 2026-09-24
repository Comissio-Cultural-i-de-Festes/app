import { beforeAll, describe, expect, it } from 'vitest'

import { type Client, F, anonClient, as, rpc, serviceClient } from './helpers'

/**
 * Els avisos pendents i les dues RPC noves d'avisos, pel camí de l'app: Kong,
 * PostgREST i un token de debò.
 *
 * EL QUE AQUESTA CAPA VEU I EL pgTAP NO:
 *   · que PostgREST resol `avisa` sense PGRST203 amb el paràmetre nou per nom,
 *     que és com el crida el client —dues `avisa()` a la base no es veuen en
 *     cap SELECT, només en una crida real—;
 *   · que la política de lectura de `avisos_pendents` filtra també per l'API, i
 *     que les escriptures directes no tenen grant;
 *   · que l'enganxada automàtica corre quan el soci desa el telèfon per
 *     PostgREST, amb el seu token, i no només com a `postgres` dins d'una
 *     transacció.
 *
 * ES POT TORNAR A EXECUTAR. Aquesta suite escriu i no desfà res, o sigui que el
 * rellotge va dins del nom i del telèfon de cada pendent, i cap asserció no
 * compta files d'una taula: cada una mira les que ha fet ella. Els telèfons són
 * inventats, comencen per 9 i no poden ser el mòbil de ningú. L'únic que es
 * torna al seu lloc és el telèfon del soci que prova l'enganxada.
 */

const RELLOTGE = String(Date.now()).slice(-6)
const TELEFON = (n: number) => `955 ${String(n)}${RELLOTGE.slice(0, 2)} ${RELLOTGE.slice(2)}`
const AHIR = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString()

let junta: Client
let soci: Client

beforeAll(async () => {
  junta = await as('junta_alfa')
  soci = await as('bravo')
})

async function creaPendent(n: number, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await rpc<string>(junta, 'crea_avis_pendent', {
    p_nom: `Persona Prova ${RELLOTGE}-${String(n)}`,
    p_telefon: TELEFON(n),
    p_falta_at: AHIR(),
    p_tipus: 'mal_gest',
    p_nota: `Prova RLS ${RELLOTGE}`,
    ...extra,
  })
  expect(error).toBeNull()
  expect(data).toBeTruthy()
  return data ?? ''
}

describe('avisos pendents per PostgREST', () => {
  it('la junta en crea un i el llegeix, amb el telèfon mentre espera', async () => {
    const id = await creaPendent(1, { p_mesura_presa: 'Trucada feta' })
    const { data, error } = await junta
      .from('avisos_pendents')
      .select('id, telefon, telefon_9, mesura_presa, enllacat_at')
      .eq('id', id)
    expect(error).toBeNull()
    expect(data?.[0]?.telefon_9).toBe(TELEFON(1).replace(/\D/g, '').slice(-9))
    expect(data?.[0]?.mesura_presa).toBe('Trucada feta')
    expect(data?.[0]?.enllacat_at).toBeNull()
  })

  it('un soci no en llegeix cap: la política filtra, i hi són', async () => {
    const id = await creaPendent(2)
    const { data, error } = await soci.from('avisos_pendents').select('id').eq('id', id)
    // USING filtra en silenci: el que es comprova és que la fila existeix per
    // a la junta i no surt per al soci, no que la taula estigui buida.
    expect(error).toBeNull()
    expect(data).toEqual([])
    const { data: perJunta } = await junta.from('avisos_pendents').select('id').eq('id', id)
    expect(perJunta).toHaveLength(1)
  })

  it('un soci no hi pot escriure directament: no hi ha grant', async () => {
    const { error } = await soci
      .from('avisos_pendents')
      .insert({
        nom: 'X',
        telefon: '955000000',
        tipus: 'mal_gest',
        gravetat: 1,
        gravetat_suggerida: 1,
        nota: 'x',
        falta_at: AHIR(),
      } as never)
    expect(error?.code).toBe('42501')
  })

  it('un soci rep 42501 de cada RPC nova', async () => {
    const pendent = await creaPendent(3)
    const crides: [string, Record<string, unknown>][] = [
      [
        'crea_avis_pendent',
        { p_nom: 'X', p_telefon: TELEFON(9), p_falta_at: AHIR(), p_tipus: 'mal_gest', p_nota: 'x' },
      ],
      ['retira_avis_pendent', { p_id: pendent, p_nota: 'x' }],
      ['enllaca_avis_pendent', { p_id: pendent, p_user_id: F.bravo }],
      ['edita_mesura_presa', { p_avis_id: pendent, p_mesura: 'x' }],
      ['avisa', { p_user_id: F.bravo, p_tipus: 'mal_gest', p_nota: 'x', p_gravetat: 1 }],
    ]
    for (const [fn, args] of crides) {
      const { error } = await rpc(soci, fn, args)
      expect(error?.code, fn).toBe('42501')
    }
  })

  it('anon no hi arriba de cap manera', async () => {
    const { error } = await rpc(anonClient(), 'crea_avis_pendent', {
      p_nom: 'X',
      p_telefon: TELEFON(8),
      p_falta_at: AHIR(),
      p_tipus: 'mal_gest',
      p_nota: 'x',
    })
    expect(error?.code).toBe('42501')
    const { data } = await anonClient().from('avisos_pendents').select('id').limit(1)
    expect(data ?? []).toEqual([])
  })

  it('l’enllaç manual el converteix en un avís del soci, datat el dia de la falta, i treu el telèfon', async () => {
    const pendent = await creaPendent(4, { p_mesura_presa: 'Reunió feta' })
    const { data: avisId, error } = await rpc<string>(junta, 'enllaca_avis_pendent', {
      p_id: pendent,
      p_user_id: F.delta,
    })
    expect(error).toBeNull()

    const delta = await as('delta')
    const { data: avis } = await delta
      .from('avisos')
      .select('id, nota, mesura_presa, created_at')
      .eq('id', avisId ?? '')
    expect(avis?.[0]?.mesura_presa).toBe('Reunió feta')

    const { data: p } = await junta
      .from('avisos_pendents')
      .select('telefon, enllacat_via, falta_at')
      .eq('id', pendent)
    expect(p?.[0]?.telefon).toBeNull()
    expect(p?.[0]?.enllacat_via).toBe('ma')
    expect(Date.parse(avis?.[0]?.created_at ?? '')).toBe(Date.parse(p?.[0]?.falta_at ?? ''))
  })

  it('retirar-ne un també en treu el telèfon', async () => {
    const pendent = await creaPendent(5)
    const { error } = await rpc(junta, 'retira_avis_pendent', {
      p_id: pendent,
      p_nota: 'Prova RLS',
    })
    expect(error).toBeNull()
    const { data } = await junta
      .from('avisos_pendents')
      .select('telefon, retirat_nota')
      .eq('id', pendent)
    expect(data?.[0]).toEqual({ telefon: null, retirat_nota: 'Prova RLS' })
  })

  it('el soci que desa el telèfon per l’API l’enganxa, sense veure cap pendent', async () => {
    const pendent = await creaPendent(6)
    const charlie = await as('charlie')
    try {
      const { error } = await charlie
        .from('profile_contact')
        .update({ telefon: `+34 ${TELEFON(6)}` })
        .eq('id', F.charlie)
        .select('id')
      expect(error).toBeNull()

      const { data: vist } = await charlie.from('avisos_pendents').select('id')
      expect(vist).toEqual([])

      const { data: p } = await junta
        .from('avisos_pendents')
        .select('enllacat_via, avis:avisos!avisos_pendents_avis_id_fkey(user_id)')
        .eq('id', pendent)
      expect(p?.[0]?.enllacat_via).toBe('telefon')
      expect(p?.[0]?.avis).toEqual({ user_id: F.charlie })
    } finally {
      await serviceClient().from('profile_contact').update({ telefon: null }).eq('id', F.charlie)
    }
  })
})

describe('avisa i la mesura presa per PostgREST', () => {
  it('avisa amb p_gravetat per nom no topa amb cap sobrecàrrega i desa la triada', async () => {
    const { data: id, error } = await rpc<string>(junta, 'avisa', {
      p_user_id: F.delta,
      p_tipus: 'mal_gest',
      p_nota: `Prova RLS ${RELLOTGE}: la junta ho veu greu`,
      p_gravetat: 2,
    })
    expect(error?.code).not.toBe('PGRST203')
    expect(error).toBeNull()
    const { data } = await junta
      .from('avisos')
      .select('gravetat')
      .eq('id', id ?? '')
    expect(data?.[0]?.gravetat).toBe(2)
  })

  it('la junta edita la mesura presa i el soci la llegeix; un UPDATE directe no té grant', async () => {
    const { data: id } = await rpc<string>(junta, 'avisa', {
      p_user_id: F.delta,
      p_tipus: 'mal_gest',
      p_nota: `Prova RLS ${RELLOTGE}: mesura`,
    })
    const { error } = await rpc(junta, 'edita_mesura_presa', {
      p_avis_id: id,
      p_mesura: ' Reunió el dia 3 ',
    })
    expect(error).toBeNull()

    const delta = await as('delta')
    const { data } = await delta
      .from('avisos')
      .select('mesura_presa')
      .eq('id', id ?? '')
    expect(data?.[0]?.mesura_presa).toBe('Reunió el dia 3')

    const { error: directe } = await junta
      .from('avisos')
      .update({ mesura_presa: 'a mà' } as never)
      .eq('id', id ?? '')
    expect(directe?.code).toBe('42501')
  })
})

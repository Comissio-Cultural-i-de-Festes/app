import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Client, F, anonClient, as, rpc } from './helpers'

/**
 * Les dades de viatger pel camí de l'app: Kong, PostgREST i un token de debò.
 *
 * EL QUE AQUESTA CAPA VEU I EL pgTAP NO:
 *   · que la política del propietari filtra també per l'API, i que la junta,
 *     que per PostgREST ho pot llegir gairebé tot, aquí no hi veu res;
 *   · que els grants de columna refusen moure una fila a una altra persona amb
 *     el codi que la pantalla llegeix, no només dins d'una transacció;
 *   · que `admin_dades_viatgers` es resol sense PGRST203 i escriu el registre
 *     quan la crida és una petició de debò.
 *
 * ES POT TORNAR A EXECUTAR. Cada passada fa la seva pròpia casa rural, amb el
 * rellotge al títol, i l'esborra en acabar: un esdeveniment publicat d'aquí a
 * deu dies sortiria a l'Inici de tothom. Cap asserció no compta files d'una
 * taula: cada una mira les de la seva casa. Les dades són inventades; el DNI
 * és l'exemple de llibre i el telèfon comença per 9.
 */

const RELLOTGE = String(Date.now()).slice(-6)
const DIA = 24 * 3600 * 1000

let junta: Client
let charlie: Client
let bravo: Client
let casa = ''

const DADES = {
  nom: 'Persona',
  cognom1: 'Inventada',
  cognom2: 'De Prova',
  sexe: 'dona',
  tipus_document: 'dni',
  numero_document: '12345678Z',
  numero_suport: 'ABC123456',
  nacionalitat: 'ES',
  data_naixement: '2003-04-05',
  adreca: 'Via Inventada 1',
  localitat: 'Poble Alfa',
  pais: 'ES',
  telefon_emergencia: '955000001',
}

beforeAll(async () => {
  junta = await as('junta_alfa')
  charlie = await as('charlie')
  bravo = await as('bravo')

  const { data, error } = await rpc<string>(junta, 'admin_save_event', {
    p_titulo: `Casa de prova ${RELLOTGE}`,
    p_tipo: 'casa_rural',
    p_starts_at: new Date(Date.now() + 10 * DIA).toISOString(),
    p_ends_at: new Date(Date.now() + 12 * DIA).toISOString(),
    p_plazas: 20,
    p_precio_cents: 0,
    p_published: true,
  })
  expect(error).toBeNull()
  casa = data ?? ''

  const flag = await rpc<number>(junta, 'admin_set_demana_viatger', {
    p_event_id: casa,
    p_demana: true,
  })
  expect(flag.error).toBeNull()

  const si = await rpc(charlie, 'set_attendance', { p_event_id: casa, p_estado: 'si' })
  expect(si.error).toBeNull()
})

afterAll(async () => {
  if (casa !== '') await rpc(junta, 'admin_delete_event', { p_event_id: casa })
})

describe('les dades de viatger per PostgREST', () => {
  it('qui hi va les desa i les llegeix', async () => {
    const { error } = await charlie
      .from('dades_viatger')
      .insert({ event_id: casa, user_id: F.charlie, ...DADES })
    expect(error).toBeNull()

    const { data } = await charlie
      .from('dades_viatger')
      .select('numero_document, telefon_emergencia')
      .eq('event_id', casa)
    expect(data).toEqual([{ numero_document: '12345678Z', telefon_emergencia: '955000001' }])
  })

  it("canvia a un document d'identitat de la UE i torna al DNI", async () => {
    const UE = { tipus_document: 'id_ue', numero_document: 'C01X00T47', numero_suport: null }
    const canvi = await charlie
      .from('dades_viatger')
      .update(UE)
      .eq('event_id', casa)
      .select('tipus_document, numero_document, numero_suport')
    expect(canvi.error).toBeNull()
    expect(canvi.data).toEqual([UE])

    const torna = await charlie
      .from('dades_viatger')
      .update({
        tipus_document: DADES.tipus_document,
        numero_document: DADES.numero_document,
        numero_suport: DADES.numero_suport,
      })
      .eq('event_id', casa)
      .select('tipus_document')
    expect(torna.error).toBeNull()
    expect(torna.data).toEqual([{ tipus_document: 'dni' }])
  })

  it('un altre soci no les veu: la política filtra, i hi són', async () => {
    const { data, error } = await bravo.from('dades_viatger').select('user_id').eq('event_id', casa)
    expect(error).toBeNull()
    expect(data).toEqual([])
    const { data: seves } = await charlie
      .from('dades_viatger')
      .select('user_id')
      .eq('event_id', casa)
    expect(seves).toHaveLength(1)
  })

  it('un altre soci no en desa a nom de ningú: WITH CHECK, 42501', async () => {
    const { error } = await bravo
      .from('dades_viatger')
      .insert({ event_id: casa, user_id: F.charlie, ...DADES, nom: 'Suplantada' })
    expect(error?.code).toBe('42501')
  })

  it('un altre soci no les edita ni les esborra', async () => {
    const edit = await bravo
      .from('dades_viatger')
      .update({ adreca: 'Via Robada' })
      .eq('event_id', casa)
      .select('user_id')
    expect(edit.error).toBeNull()
    expect(edit.data).toEqual([])

    const del = await bravo.from('dades_viatger').delete().eq('event_id', casa).select('user_id')
    expect(del.error).toBeNull()
    expect(del.data).toEqual([])

    const { data } = await charlie.from('dades_viatger').select('adreca').eq('event_id', casa)
    expect(data).toEqual([{ adreca: 'Via Inventada 1' }])
  })

  it('el propietari no se les pot passar a algú altre: no hi ha grant de columna', async () => {
    const { error } = await charlie
      .from('dades_viatger')
      .update({ user_id: F.bravo })
      .eq('event_id', casa)
    expect(error?.code).toBe('42501')
  })

  it('la base refusa un DNI amb la lletra que no toca', async () => {
    const { error } = await charlie
      .from('dades_viatger')
      .update({ numero_document: '12345678A' })
      .eq('event_id', casa)
    expect(error?.code).toBe('23514')
  })

  it('anon no hi arriba', async () => {
    const anon = anonClient()
    const { error } = await anon.from('dades_viatger').select('user_id').eq('event_id', casa)
    expect(error?.code).toBe('42501')
    const viaRpc = await rpc(anon, 'admin_dades_viatgers', { p_event_id: casa, p_exporta: false })
    expect(viaRpc.error).not.toBeNull()
  })

  it('la junta no les llegeix de la taula', async () => {
    const { data, error } = await junta.from('dades_viatger').select('user_id').eq('event_id', casa)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('la junta les llegeix per la RPC, i queda escrit', async () => {
    const { data, error } = await rpc<{ user_id: string; numero_document: string }[]>(
      junta,
      'admin_dades_viatgers',
      { p_event_id: casa, p_exporta: true },
    )
    expect(error).toBeNull()
    expect(data?.map((r) => [r.user_id, r.numero_document])).toEqual([[F.charlie, '12345678Z']])

    const { data: registre } = await junta
      .from('audit_log')
      .select('accio, actor_id, detall')
      .eq('accio', 'consulta_viatgers')
      .eq('target_id', casa)
    expect(registre).toEqual([
      {
        accio: 'consulta_viatgers',
        actor_id: F.juntaAlfa,
        detall: { exporta: true, persones: [F.charlie] },
      },
    ])
  })

  it('un soci no fa servir les RPC de la junta', async () => {
    const dades = await rpc(charlie, 'admin_dades_viatgers', { p_event_id: casa, p_exporta: false })
    expect(dades.error?.code).toBe('42501')
    const llista = await rpc(charlie, 'admin_viatgers', { p_event_id: casa })
    expect(llista.error?.code).toBe('42501')
  })

  it('treure la casella les esborra, i ho diu', async () => {
    const { data, error } = await rpc<number>(junta, 'admin_set_demana_viatger', {
      p_event_id: casa,
      p_demana: false,
    })
    expect(error).toBeNull()
    expect(data).toBe(1)

    const { data: seves } = await charlie
      .from('dades_viatger')
      .select('user_id')
      .eq('event_id', casa)
    expect(seves).toEqual([])
  })
})

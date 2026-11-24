import { beforeAll, describe, expect, it } from 'vitest'

import { type Client, F, anonClient, as, rpc } from './helpers'

/**
 * Un avís el proposa una persona de la junta i el valida una altra (migració
 * 93), pel camí de l'app: Kong, PostgREST i un token de debò.
 *
 * EL QUE AQUESTA CAPA VEU I EL pgTAP NO:
 *   · que el HINT arriba al client —`error.hint`—, que és el que `errorKey`
 *     llegeix per dir «l'has proposat tu» en comptes de «no ho pots fer tu»;
 *   · que `valida_avis` es resol per nom sense cap sobrecàrrega;
 *   · que la política amaga el proposat al soci per l'API, amb una llista buida
 *     i no un error, i que l'hi ensenya en validar-lo.
 *
 * ES POT TORNAR A EXECUTAR. La suite no desfà res: cada cas fa els seus avisos
 * amb el rellotge a la nota i només mira els que ha fet. Gairebé tots són de
 * zero punts; el que en resta un el torna a retirar al final, perquè el sostre
 * del curs compta les compensacions i cent passades no hi han d'arribar.
 */

// Com els de `helpers.F`, escrit sencer: la fixture de la llavor.
const JUNTA_BRAVO = '00000000-0000-4000-8000-0000000000a2'

const RELLOTGE = String(Date.now()).slice(-6)
const nota = (que: string) => `Prova RLS ${RELLOTGE}: ${que}`

let ja: Client
let jb: Client
let bravo: Client

beforeAll(async () => {
  ja = await as('junta_alfa')
  jb = await as('junta_bravo')
  bravo = await as('bravo')
})

async function proposa(userId: string, que: string, punts = 0): Promise<string> {
  const { data, error } = await rpc<string>(ja, 'avisa', {
    p_user_id: userId,
    p_tipus: 'mal_gest',
    p_nota: nota(que),
    p_punts: punts,
  })
  expect(error).toBeNull()
  expect(data).toBeTruthy()
  return data ?? ''
}

describe('la segona persona, per PostgREST', () => {
  it('ningú no es proposa un avís a si mateix, i el HINT arriba al client', async () => {
    const { error } = await rpc(ja, 'avisa', {
      p_user_id: F.juntaAlfa,
      p_tipus: 'mal_gest',
      p_nota: nota('a mi mateixa'),
    })
    expect(error?.code).toBe('42501')
    expect(error?.hint).toBe('avis_propi')
  })

  it('el soci no veu el proposat; la junta sí', async () => {
    const id = await proposa(F.bravo, 'proposat')

    const { data: perSoci, error } = await bravo.from('avisos').select('id').eq('id', id)
    // USING filtra en silenci: llista buida, i la fila existeix per a la junta.
    expect(error).toBeNull()
    expect(perSoci).toEqual([])

    const { data: perJunta } = await jb.from('avisos').select('id, validat_at').eq('id', id)
    expect(perJunta).toEqual([{ id, validat_at: null }])
  })

  it('qui l’ha proposat no el valida, ni el soci, ni l’anònim', async () => {
    const id = await proposa(F.bravo, 'qui no el valida')

    const propi = await rpc(ja, 'valida_avis', { p_avis_id: id })
    expect(propi.error?.code).toBe('42501')
    expect(propi.error?.hint).toBe('avis_validacio_propia')

    const soci = await rpc(bravo, 'valida_avis', { p_avis_id: id })
    expect(soci.error?.code).toBe('42501')

    const anon = await rpc(anonClient(), 'valida_avis', { p_avis_id: id })
    expect(anon.error).not.toBeNull()
  })

  it('qui el rep no el valida ni el rebutja, encara que sigui de la junta', async () => {
    const id = await proposa(JUNTA_BRAVO, 'a la junta bravo')

    const valida = await rpc(jb, 'valida_avis', { p_avis_id: id })
    expect(valida.error?.code).toBe('42501')
    expect(valida.error?.hint).toBe('avis_propi')

    const propi = await rpc(jb, 'rebutja_avis', { p_avis_id: id, p_nota: nota('me’l trec') })
    expect(propi.error?.code).toBe('42501')
    expect(propi.error?.hint).toBe('avis_propi')

    // I no la veu: la política li amaga les propostes contra ell.
    const { data: vist } = await jb.from('avisos').select('id').eq('id', id)
    expect(vist).toEqual([])

    // El control: qui l'ha proposat sí que el pot rebutjar.
    const rebutja = await rpc(ja, 'rebutja_avis', { p_avis_id: id, p_nota: nota('rebutjat') })
    expect(rebutja.error).toBeNull()
  })

  it('validat per una segona persona, compta: resta, el soci el veu, i no es valida dos cops', async () => {
    const id = await proposa(F.bravo, 'validat', -1)

    const { error } = await rpc(jb, 'valida_avis', { p_avis_id: id })
    expect(error?.code).not.toBe('PGRST203')
    expect(error).toBeNull()

    const { data: vist } = await bravo
      .from('avisos')
      .select('id, punts, points_log!avisos_points_log_id_fkey(puntos)')
      .eq('id', id)
    expect(vist).toEqual([{ id, punts: -1, points_log: { puntos: -1 } }])

    const dos = await rpc(await as('junta_charlie'), 'valida_avis', { p_avis_id: id })
    expect(dos.error?.code).toBe('22023')
    expect(dos.error?.hint).toBe('avis_ja_resolt')

    // Rebutjar-lo tard —la carrera de qui l'havia obert abans que es validés—
    // ho diu i no el retira.
    const tard = await rpc(ja, 'rebutja_avis', { p_avis_id: id, p_nota: nota('tard') })
    expect(tard.error?.hint).toBe('avis_ja_resolt')

    // I es retira, que torna el punt i deixa el sostre com estava.
    const retira = await rpc(await as('junta_charlie'), 'retira_avis', {
      p_avis_id: id,
      p_nota: nota('retirat al final de la prova'),
    })
    expect(retira.error).toBeNull()
  })

  it('un de rebutjat, el soci no el veu mai', async () => {
    const id = await proposa(F.bravo, 'rebutjat abans de comptar')

    const retira = await rpc(ja, 'retira_avis', { p_avis_id: id, p_nota: nota('retirar-lo') })
    expect(retira.error?.hint).toBe('avis_proposat')

    const { error } = await rpc(ja, 'rebutja_avis', {
      p_avis_id: id,
      p_nota: nota('no era per tant'),
    })
    expect(error).toBeNull()

    const { data } = await bravo.from('avisos').select('id').eq('id', id)
    expect(data).toEqual([])

    const tard = await rpc(jb, 'valida_avis', { p_avis_id: id })
    expect(tard.error?.hint).toBe('avis_ja_resolt')
  })

  it('validar no té cap camí directe: cap grant d’UPDATE', async () => {
    const id = await proposa(F.bravo, 'update directe')
    const { error } = await jb
      .from('avisos')
      .update({ validat_at: new Date().toISOString() } as never)
      .eq('id', id)
    expect(error?.code).toBe('42501')
  })
})

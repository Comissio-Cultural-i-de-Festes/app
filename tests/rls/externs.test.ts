import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { F, as } from './helpers'

/**
 * Qui ve de fora (migració 96), vist des d'on l'app ho escriu: PostgREST amb un
 * testimoni de debò.
 *
 * El 502 prova la regla des de dins. Aquí es prova que els dos camins que fa
 * servir el client —el primer cop, des de la sessió de la mateixa persona, i
 * la fitxa de la junta— arriben i tornen la fila, i que el refús del `check`
 * surt com un 23514 i no com un 200 buit.
 *
 * AMB EL PENDENT I NO AMB UN SOCI DE LA LLAVOR. Marcar algú com a extern li
 * buida l'escola, i un soci actiu sense escola canvia els recomptes de
 * `ranking_escoles_period` que llegeixen altres fitxers d'aquesta suite, que
 * corren al mateix temps. El pendent no compta enlloc, i és a més qui de debò
 * passa pel primer cop.
 *
 * TORNABLE A EXECUTAR. La suite no desfà res, així que la fila es deixa com la
 * deixa la llavor —sense escola i sense ser extern— abans i després, i es fa
 * des de la junta, que és un camí que també es prova.
 */
describe('a member from outside the schools says so, and the junta can correct it', () => {
  const deixaCom = async () => {
    const junta = await as('junta_alfa')
    const { error } = await junta
      .from('profiles')
      .update({ extern: false, escola: null })
      .eq('id', F.pendent)
    expect(error).toBeNull()
  }

  beforeAll(deixaCom)
  afterAll(deixaCom)

  it('extern with a school is a 23514 from the check, not a silent 200', async () => {
    const pendent = await as('pendent_alfa')
    const { error } = await pendent
      .from('profiles')
      .update({ extern: true, escola: 'salut' })
      .eq('id', F.pendent)

    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('profiles_extern_sense_escola')
  })

  it('the first run marks oneself as extern', async () => {
    const pendent = await as('pendent_alfa')
    const { data, error } = await pendent
      .from('profiles')
      .update({ extern: true, escola: null, grau: null, curs: null })
      .eq('id', F.pendent)
      .select('id, escola, extern')

    expect(error).toBeNull()
    expect(data).toEqual([{ id: F.pendent, escola: null, extern: true }])
  })

  it('another member cannot touch it: the policy filters the row out', async () => {
    const bravo = await as('bravo')
    const { data, error } = await bravo
      .from('profiles')
      .update({ extern: false })
      .eq('id', F.pendent)
      .select('id')

    expect(error).toBeNull()
    expect(data).toEqual([])

    const pendent = await as('pendent_alfa')
    const { data: fila } = await pendent
      .from('profiles')
      .select('extern')
      .eq('id', F.pendent)
      .single()
    expect(fila?.extern).toBe(true)
  })

  it('the junta unmarks and marks again from the member sheet', async () => {
    const junta = await as('junta_alfa')

    const fora = await junta
      .from('profiles')
      .update({ extern: false })
      .eq('id', F.pendent)
      .select('id, extern')
    expect(fora.error).toBeNull()
    expect(fora.data).toEqual([{ id: F.pendent, extern: false }])

    const dins = await junta
      .from('profiles')
      .update({ extern: true, escola: null, grau: null, curs: null })
      .eq('id', F.pendent)
      .select('id, extern')
    expect(dins.error).toBeNull()
    expect(dins.data).toEqual([{ id: F.pendent, extern: true }])
  })
})

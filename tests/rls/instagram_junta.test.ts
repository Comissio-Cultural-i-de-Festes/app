import { beforeAll, describe, expect, it } from 'vitest'

import { F, as, serviceClient } from './helpers'

/**
 * La tanca de l'Instagram, vista des d'on l'app la viu: Kong, PostgREST i un
 * testimoni de debò.
 *
 * PER QUÈ CAL AQUÍ I NO NOMÉS AL pgTAP. El 455 i el 456 proven la regla des de
 * dins de la base de dades, i fan bé de provar-la. El que no poden veure és la
 * RESPOSTA: la migració 79 va triar fixar el valor vell en comptes de petar, i
 * la conseqüència d'aquella tria és el que rep qui escriu —un 200, no un
 * 42501—. Això no té cap signatura a nivell d'SQL: un `update` de pgTAP que no
 * mou res i un que peta es distingeixen amb un `throws_ok`, però la diferència
 * entre «204 sense dir res» i «200 amb la fila corregida a dins» només existeix
 * un cop PostgREST ha format la resposta. La decisió estava escrita a la
 * migració i no la comprovava ningú.
 *
 * I la segona meitat importa igual: `profiles_update_admin` hi és perquè la
 * junta pugui corregir un nom mal escrit, i una tanca massa ampla se l'enduria
 * sense que cap prova del 455 se n'adonés.
 *
 * NOM NOU A CADA EXECUCIÓ. Aquesta suite escriu sobre la base de dades i no
 * desfà res: amb una constant, la segona passada comprovaria el que hi va
 * deixar la primera.
 *
 * Gent inventada, com a tot el repositori.
 */
describe('the Instagram handle is written by the member whose row it is, and by nobody else', () => {
  const seu = `bravo_${String(Date.now())}`.slice(0, 30)

  beforeAll(async () => {
    // Es posa des de la seva pròpia sessió, que és l'únic camí legítim: així
    // el punt de partida el valida la mateixa regla que es vol provar.
    const bravo = await as('bravo')
    const { error } = await bravo.from('profiles').update({ instagram: seu }).eq('id', F.bravo)
    expect(error).toBeNull()
  })

  it('the junta gets a 200 with the old value in it, not an error and not the write', async () => {
    const junta = await as('junta_alfa')
    const { data, error } = await junta
      .from('profiles')
      .update({ instagram: 'compte_que_no_es_seu' })
      .eq('id', F.bravo)
      .select('id, instagram')

    // La decisió de la 79 feta visible des de fora: la sentència arriba, la
    // columna no es mou, i la representació ja porta el valor corregit.
    expect(error).toBeNull()
    expect(data).toEqual([{ id: F.bravo, instagram: seu }])

    const { data: fila } = await serviceClient()
      .from('profiles')
      .select('instagram')
      .eq('id', F.bravo)
      .single()
    expect(fila?.instagram).toBe(seu)
  })

  it('and cannot delete it either, which is the same act with the sign changed', async () => {
    const junta = await as('junta_alfa')
    const { error } = await junta.from('profiles').update({ instagram: null }).eq('id', F.bravo)
    expect(error).toBeNull()

    const { data: fila } = await serviceClient()
      .from('profiles')
      .select('instagram')
      .eq('id', F.bravo)
      .single()
    expect(fila?.instagram).toBe(seu)
  })

  it('an upsert does not get round it: profiles has no INSERT grant at all', async () => {
    const junta = await as('junta_alfa')
    const { error } = await junta
      .from('profiles')
      .upsert({ id: F.bravo, nombre: 'Bravo', instagram: 'per_la_porta_del_darrere' })

    expect(error?.code).toBe('42501')
  })

  it('but the junta still fixes a badly spelled name in the very same statement', async () => {
    const { data: abans } = await serviceClient()
      .from('profiles')
      .select('nombre')
      .eq('id', F.bravo)
      .single()

    const junta = await as('junta_alfa')
    const { data, error } = await junta
      .from('profiles')
      .update({ nombre: 'Bravo Ben Escrit', instagram: 'compte_que_no_es_seu' })
      .eq('id', F.bravo)
      .select('id, nombre, instagram')

    // Cau el camp que no els pertoca i la resta de la sentència arriba. Amb un
    // `raise` aquí no hi hauria ni el nom.
    expect(error).toBeNull()
    expect(data).toEqual([{ id: F.bravo, nombre: 'Bravo Ben Escrit', instagram: seu }])

    // I es torna a deixar com estava, que la suite no desfà res sola.
    await serviceClient()
      .from('profiles')
      .update({ nombre: abans?.nombre ?? 'Bravo' })
      .eq('id', F.bravo)
  })

  it('and a junta member puts their own on, because the rule is about the row, not the role', async () => {
    const seuDeLaJunta = `junta_${String(Date.now())}`.slice(0, 30)
    const junta = await as('junta_alfa')
    const { data, error } = await junta
      .from('profiles')
      .update({ instagram: seuDeLaJunta })
      .eq('id', F.juntaAlfa)
      .select('id, instagram')

    expect(error).toBeNull()
    expect(data).toEqual([{ id: F.juntaAlfa, instagram: seuDeLaJunta }])
  })
})

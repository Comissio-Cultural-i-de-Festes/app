import { beforeEach, describe, expect, it, vi } from 'vitest'

import { saveFirstRun } from './api'

/**
 * El que el primer cop escriu a `profiles`.
 *
 * La regla que importa viu a la base de dades —`profiles_extern_sense_escola`
 * no deixa ser extern amb escola—, però qui l'ha de complir és aquest `update`:
 * si «vinc de fora» enviés l'escola d'un clic anterior, o se n'oblidés
 * l'`extern`, l'alta petaria amb un 23514 o la persona tornaria al primer cop
 * per sempre. Les dues columnes han d'anar juntes a la mateixa sentència.
 */

const updates: Record<string, unknown>[] = []

vi.mock('@/lib/supabase', () => {
  const chain = {
    update: (values: Record<string, unknown>) => {
      updates.push(values)
      return chain
    },
    eq: () => chain,
    select: () => Promise.resolve({ data: [{ id: 'u-1' }], error: null }),
  }
  return { supabase: { from: () => chain } }
})

beforeEach(() => {
  updates.length = 0
})

const rest = { grau: null, curs: null, instagram: null, telefon: null }

describe('saveFirstRun', () => {
  it('amb una escola, la desa i no és extern', async () => {
    await saveFirstRun('u-1', { ...rest, escola: 'salut', grau: 'Infermeria', curs: 2 })
    expect(updates[0]).toMatchObject({
      escola: 'salut',
      extern: false,
      grau: 'Infermeria',
      curs: 2,
    })
  })

  it('«vinc de fora» desa extern i deixa l’escola a null', async () => {
    await saveFirstRun('u-1', { ...rest, escola: 'fora' })
    expect(updates[0]).toMatchObject({ escola: null, extern: true, grau: null, curs: null })
  })
})

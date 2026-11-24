import { describe, expect, it } from 'vitest'

import { endsOnOtherDay } from './interval'

const D = (iso: string): Date => new Date(iso)

describe('endsOnOtherDay', () => {
  it('no ho és quan acaba el mateix dia', () => {
    expect(endsOnOtherDay(D('2026-11-23T21:00:00+01:00'), D('2026-11-23T23:30:00+01:00'))).toBe(
      false,
    )
  })

  it('ho és quan una estada acaba dos dies després', () => {
    expect(endsOnOtherDay(D('2026-11-23T22:00:00+01:00'), D('2026-11-25T18:00:00+01:00'))).toBe(
      true,
    )
  })

  it('una festa que acaba de matinada continua sent la mateixa nit', () => {
    expect(endsOnOtherDay(D('2026-11-23T23:00:00+01:00'), D('2026-11-24T03:00:00+01:00'))).toBe(
      false,
    )
  })

  it("l'endemà a primera hora encara és la nit, però no a les sis", () => {
    expect(endsOnOtherDay(D('2026-11-23T23:00:00+01:00'), D('2026-11-24T05:59:00+01:00'))).toBe(
      false,
    )
    expect(endsOnOtherDay(D('2026-11-23T23:00:00+01:00'), D('2026-11-24T06:00:00+01:00'))).toBe(
      true,
    )
  })

  it("l'endemà al migdia es diu, encara que duri poc", () => {
    expect(endsOnOtherDay(D('2026-11-23T20:00:00+01:00'), D('2026-11-24T10:00:00+01:00'))).toBe(
      true,
    )
  })

  it('una matinada que passa de les dotze hores no és una nit', () => {
    expect(endsOnOtherDay(D('2026-11-23T10:00:00+01:00'), D('2026-11-24T04:00:00+01:00'))).toBe(
      true,
    )
  })

  it("compta els dies a la zona de l'associació i no a la d'UTC", () => {
    // 23:30 a Madrid són les 22:30 UTC; 00:30 a Madrid, les 23:30 UTC del mateix dia.
    expect(endsOnOtherDay(D('2026-11-23T22:30:00Z'), D('2026-11-23T23:30:00Z'))).toBe(false)
    expect(endsOnOtherDay(D('2026-11-23T10:00:00Z'), D('2026-11-23T23:30:00Z'))).toBe(true)
  })

  it("un final igual que l'inici o abans no s'inventa un dia", () => {
    expect(endsOnOtherDay(D('2026-11-23T22:00:00+01:00'), D('2026-11-23T22:00:00+01:00'))).toBe(
      false,
    )
  })
})

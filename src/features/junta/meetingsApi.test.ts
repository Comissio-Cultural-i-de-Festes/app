import { describe, expect, it } from 'vitest'

import { type MeetingRow, byWhatNeedsYou } from './meetingsApi'

/**
 * L'ordre de les reunions al panell.
 *
 * El cas que va fer escriure això: tres reunions convocades i cap feta. Amb un
 * `order by starts_at desc` a la consulta, a dalt sortia la del mes que ve.
 */

const NOW = Date.parse('2026-09-03T12:00:00Z')

function meeting(over: Partial<MeetingRow> & { readonly id: string }): MeetingRow {
  return {
    titulo: 'Una reunió',
    starts_at: '2026-09-03T10:00:00Z',
    ubicacion: null,
    abast: 'junta',
    tancada_at: null,
    acta: null,
    puntos: 0,
    ...over,
  }
}

const ids = (rows: readonly MeetingRow[]) => rows.map((m) => m.id)

describe('byWhatNeedsYou', () => {
  it('posa primer la que s\u2019ha fet i ningú ha tancat', () => {
    const rows = [
      meeting({ id: 'demà', starts_at: '2026-09-04T18:00:00Z' }),
      meeting({ id: 'ahir', starts_at: '2026-09-02T18:00:00Z' }),
    ]
    expect(ids(byWhatNeedsYou(rows, NOW))).toEqual(['ahir', 'demà'])
  })

  it('i entre dues per fer, la que ja toca abans', () => {
    const rows = [
      meeting({ id: 'el-mes-que-ve', starts_at: '2026-10-01T18:00:00Z' }),
      meeting({ id: 'dilluns', starts_at: '2026-09-07T18:00:00Z' }),
    ]
    expect(ids(byWhatNeedsYou(rows, NOW))).toEqual(['dilluns', 'el-mes-que-ve'])
  })

  it('les tancades van al final, per recents que siguin', () => {
    const rows = [
      meeting({
        id: 'tancada-ahir',
        starts_at: '2026-09-02T18:00:00Z',
        tancada_at: '2026-09-02T20:00:00Z',
      }),
      meeting({ id: 'el-mes-que-ve', starts_at: '2026-10-01T18:00:00Z' }),
      meeting({ id: 'sense-tancar', starts_at: '2026-08-20T18:00:00Z' }),
    ]
    expect(ids(byWhatNeedsYou(rows, NOW))).toEqual([
      'sense-tancar',
      'el-mes-que-ve',
      'tancada-ahir',
    ])
  })

  it('i entre tancades, l\u2019última primer, que és on es va a llegir l\u2019acta', () => {
    const rows = [
      meeting({
        id: 'vella',
        starts_at: '2026-07-01T18:00:00Z',
        tancada_at: '2026-07-01T20:00:00Z',
      }),
      meeting({
        id: 'recent',
        starts_at: '2026-08-28T18:00:00Z',
        tancada_at: '2026-08-28T20:00:00Z',
      }),
    ]
    expect(ids(byWhatNeedsYou(rows, NOW))).toEqual(['recent', 'vella'])
  })

  it('no toca la llista que rep', () => {
    const rows = [
      meeting({ id: 'b', starts_at: '2026-10-01T18:00:00Z' }),
      meeting({ id: 'a', starts_at: '2026-09-02T18:00:00Z' }),
    ]
    byWhatNeedsYou(rows, NOW)
    expect(ids(rows)).toEqual(['b', 'a'])
  })
})

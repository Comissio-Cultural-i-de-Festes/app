import { describe, expect, it } from 'vitest'

import { IN_PROGRESS_MS } from '@/lib/eventEnd'
import type { EventRow } from '@/lib/schema'

import { horizonIso, placesLeft } from './api'

const EVENT = 'e1'

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: EVENT,
    titulo: 'Alfa',
    tipo: 'fiesta',
    starts_at: '2026-09-25T19:00:00Z',
    teaser: null,
    reveal_at: null,
    revelat: true,
    cal_confirmacio: false,
    te_cotxes: false,
    plazas: null,
    precio_cents: 0,
    puntos: 10,
    published: true,
    created_by: null,
    created_at: null,
    descripcion: null,
    ubicacion: null,
    ends_at: null,
    cover_url: null,
    transport_info: null,
    abast: 'comi',
    tancada_at: null,
    acta: null,
    a_la_uni: false,
    minuts_memoria: 0,
    hores_verificat_at: null,
    hores_verificat_per: null,
    ...over,
  }
}

describe('places left', () => {
  it('is nothing at all when the event has no limit', () => {
    expect(placesLeft(event({ plazas: null }), 40)).toBeNull()
  })

  it('subtracts the people coming from the cap', () => {
    expect(placesLeft(event({ plazas: 30 }), 8)).toBe(22)
  })

  it('never goes below zero, because a walk-in can push past the cap', () => {
    // Somebody scanned at the door who was not on the list is a legitimate
    // thirty-first attendee. "Queden -1 places" is not a thing to show anybody.
    expect(placesLeft(event({ plazas: 30 }), 31)).toBe(0)
  })
})

describe('the horizon', () => {
  const noon = Date.UTC(2026, 8, 25, 12, 34, 56)

  it('keeps an event that started a couple of hours ago on the screen', () => {
    expect(Date.parse(horizonIso(noon))).toBeLessThan(noon - 2 * 3_600_000)
  })

  it('lets go of one that finished this morning', () => {
    expect(Date.parse(horizonIso(noon))).toBeGreaterThan(noon - IN_PROGRESS_MS - 3_600_000)
  })

  it('lands on the hour, so it is a stable cache key', () => {
    // A boundary that moves every millisecond is a new query key on every
    // render, which is a request per render.
    expect(horizonIso(noon)).toBe(horizonIso(noon + 60_000))
    expect(Date.parse(horizonIso(noon)) % 3_600_000).toBe(0)
  })
})

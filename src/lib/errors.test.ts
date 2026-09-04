import { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { DbError } from './db'
import { errorKey } from './errors'
import { UnreadableImage } from './storage'

/**
 * Which sentence a failure gets.
 *
 * Forty-seven screens call this function to decide what a person is told when
 * something goes wrong, and it had no test at all. The consequence is not an
 * exception anybody would notice — it is a member being told to check their
 * signal when what actually happened is that the event no longer exists.
 *
 * The map below is the whole point of the file: the codes are the ones the 169
 * `raise` statements in `supabase/migrations` actually use, counted from the
 * migrations rather than imagined. If a migration starts raising a code that
 * is not here, this test will not catch it — nothing can, short of listing the
 * codes in the schema — but it does pin every code that exists today, so a
 * refactor of the branch order cannot silently reroute one.
 */

// La classe de debo i no un objecte literal: `PostgrestError` estén `Error`,
// aixi que cap literal la satisfa, i fabricar-ne un amb un cast provaria que
// el cast compila i prou.
const db = (code: string): DbError =>
  new DbError(new PostgrestError({ code, message: 'x', details: '', hint: '' }))

describe('errorKey', () => {
  it('puts offline first, whatever the error is', () => {
    // A policy refusal reached over no network at all is still, to the person
    // holding the phone, no network.
    expect(errorKey(db('42501'), false)).toBe('errors.offline')
    expect(errorKey(new Error('boom'), false)).toBe('errors.offline')
  })

  describe('the codes the migrations raise', () => {
    const cases: readonly (readonly [string, string, number])[] = [
      // [code, key, how many sites use it]
      ['42501', 'errors.forbidden', 96],
      ['22023', 'errors.generic', 54],
      ['P0002', 'errors.notFound', 12],
      ['P0001', 'errors.forbidden', 3],
      ['55000', 'errors.generic', 1],
      ['23514', 'errors.generic', 1],
    ]

    for (const [code, key, sites] of cases) {
      it(`${code} (${String(sites)} sites) is ${key}`, () => {
        expect(errorKey(db(code), true)).toBe(key)
      })
    }

    // The three that used to fall through to «no hi ha manera de connectar,
    // mira la cobertura», which is advice nobody can act on when the real
    // answer is that the thing is gone.
    it('never tells somebody to check their signal for a business refusal', () => {
      for (const code of ['P0002', 'P0001', '55000']) {
        expect(errorKey(db(code), true), code).not.toBe('errors.network')
      }
    })
  })

  describe("PostgREST's own", () => {
    it('reads a missing single row as not found', () => {
      expect(errorKey(db('PGRST116'), true)).toBe('errors.notFound')
    })

    it('tells the junta the migrations are behind, for both shapes of it', () => {
      expect(errorKey(db('PGRST202'), true)).toBe('errors.behindServer')
      expect(errorKey(db('PGRST203'), true)).toBe('errors.behindServer')
    })

    it('falls back to generic for the rest of PGRST', () => {
      expect(errorKey(db('PGRST301'), true)).toBe('errors.generic')
      expect(errorKey(db('PGRST100'), true)).toBe('errors.generic')
    })
  })

  /**
   * A file the browser cannot decode — a HEIC off an iPhone, in practice.
   *
   * It comes BEFORE the offline check on purpose: the file being unreadable
   * has nothing to do with coverage, and «check your signal» sends somebody
   * to look at the wrong thing. So it wins even with the radio off.
   */
  it('names an unreadable image, offline or not', () => {
    const bad = new UnreadableImage(new Error('decode failed'))
    expect(errorKey(bad, true)).toBe('errors.notAnImage')
    expect(errorKey(bad, false)).toBe('errors.notAnImage')
  })

  it('treats anything that is not a DbError as transport', () => {
    expect(errorKey(new Error('fetch failed'), true)).toBe('errors.network')
    expect(errorKey(null, true)).toBe('errors.network')
    expect(errorKey('a string', true)).toBe('errors.network')
  })

  /**
   * The order matters, and this is the assertion that pins it.
   *
   * `42501` would also match the class-42 branch below it, and `PGRST116`
   * would match the `startsWith('PGRST')` fallback. Both specific branches sit
   * above their general ones on purpose, and swapping two lines during a
   * refactor would change what a locked-out member reads without failing
   * anything else.
   */
  it('prefers the specific branch over the class it belongs to', () => {
    expect(errorKey(db('42501'), true)).toBe('errors.forbidden')
    expect(errorKey(db('42P01'), true)).toBe('errors.generic')
    expect(errorKey(db('PGRST116'), true)).toBe('errors.notFound')
    expect(errorKey(db('PGRST999'), true)).toBe('errors.generic')
  })
})

import { describe, expect, it } from 'vitest'

import { cardFilename } from './share'

describe('the name a card is saved under', () => {
  it('is a slug of the parts, with an extension', () => {
    expect(cardFilename(['Cloenda Alfa', 'diptic'])).toBe('cloenda-alfa-diptic.png')
  })

  it('loses the accents rather than the letters', () => {
    // A Catalan event title goes through this on every share. Stripping the
    // whole word because of one accent would be worse than stripping the mark.
    expect(cardFilename(['Benvinguda a la Politècnica'])).toBe('benvinguda-a-la-politecnica.png')
  })

  it('is never just an extension', () => {
    // `download=""` makes the browser save the file under the origin's name,
    // which is how a card ends up in somebody's photos called "localhost".
    expect(cardFilename(['·', ' '])).toBe('targeta.png')
    expect(cardFilename([])).toBe('targeta.png')
  })

  it('does not run away with a long title', () => {
    const long = cardFilename(['a'.repeat(200), 'recap'])
    expect(long.length).toBeLessThanOrEqual(64)
    expect(long.endsWith('.png')).toBe(true)
  })
})

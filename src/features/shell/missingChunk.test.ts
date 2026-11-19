import { describe, expect, it } from 'vitest'

import { isMissingChunk } from './missingChunk'

/** Les tres frases, una per navegador, i un error corrent que no ho és. */

describe('isMissingChunk', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x.test/assets/a.js',
    'Importing a module script failed.',
    'error loading dynamically imported module: https://x.test/assets/a.js',
  ])('%s', (message) => {
    expect(isMissingChunk(new Error(message))).toBe(true)
  })

  it('no confon un error de render amb un tros que falta', () => {
    expect(isMissingChunk(new Error('cannot read properties of undefined'))).toBe(false)
    expect(isMissingChunk('Failed to fetch dynamically imported module')).toBe(true)
  })
})

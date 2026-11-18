// @vitest-environment node
/**
 * The JS glue that loads the wasm comes from the zxing-wasm that
 * barcode-detector resolves; the binary comes from the one the app imports in
 * decoder.ts. The two are only compatible at the same version (the module ABI
 * changes between patch releases), and a mismatch fails silently: on an iPhone
 * the scanner just never reads a code. This pins that they stay the same copy.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Pkg {
  name?: string
  version?: string
  dependencies: Record<string, string>
}

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** Version of the zxing-wasm package that contains `entry`, read from its package.json. */
function zxingVersionOf(entry: string): string {
  let dir = dirname(entry)
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Pkg
      if (pkg.name === 'zxing-wasm') return pkg.version!
    } catch {
      // keep climbing
    }
    const up = dirname(dir)
    if (up === dir) throw new Error('zxing-wasm package.json not found')
    dir = up
  }
}

describe('zxing-wasm', () => {
  it('el wasm de l’app i el JS de barcode-detector són de la mateixa versió', () => {
    const detectorDir = dirname(require.resolve('barcode-detector/ponyfill'))
    const appCopy = zxingVersionOf(require.resolve('zxing-wasm/reader/zxing_reader.wasm'))
    const detectorCopy = zxingVersionOf(
      createRequire(join(detectorDir, 'x.js')).resolve('zxing-wasm/reader'),
    )
    expect(appCopy).toBe(detectorCopy)
  })

  it('l’arrel declara zxing-wasm exacte, sense ^ ni ~', () => {
    const pkg = JSON.parse(readFileSync(join(here, '../../../package.json'), 'utf8')) as Pkg
    expect(pkg.dependencies['zxing-wasm']).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

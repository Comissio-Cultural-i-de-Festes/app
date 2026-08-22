import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import ca from '../src/i18n/locales/ca.json' with { type: 'json' }

/**
 * Every key the code asks for exists.
 *
 * i18next does not throw for a missing key — it renders the key itself. So
 * `t('home.places.open')` on a screen nobody has opened in Catalan puts the
 * literal string HOME.PLACES.OPEN in forty-pixel display type on the home
 * screen, and the only way to find out is to look at that screen in that
 * state. Deleting a key during a rewrite and leaving one call site behind is
 * an easy mistake and an ugly one.
 *
 * The parity test next door checks that the three locales agree with each
 * other. This one checks that they agree with the code.
 */

const SOURCES = globSync('src/**/*.{ts,tsx}').filter((f) => !f.includes('.test.'))

/** t('a.b.c') and t("a.b.c"), with or without a second argument. */
const STATIC_KEY = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g

/** t(`a.b.${…}`) — only the fixed prefix can be checked. */
const DYNAMIC_PREFIX = /\bt\(\s*`([a-zA-Z0-9_.]*)\$\{/g

type Tree = Record<string, unknown>

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (typeof node !== 'object' || node === null) return undefined
    return (node as Tree)[part]
  }, ca)
}

/** i18next stores a pluralised key as `key_one` and `key_other`. */
function resolves(key: string): boolean {
  if (typeof lookup(key) === 'string') return true
  return typeof lookup(`${key}_other`) === 'string'
}

/**
 * Comments are not call sites.
 *
 * Doc comments in this codebase show how to use things, and an example like
 * `t('home.welcome', { association })` is illustrative rather than real. A
 * check that reads its own documentation as evidence is the same mistake in
 * the opposite direction: here it produces a false alarm, and the fix for a
 * false alarm is usually to weaken the check.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function collect(pattern: RegExp): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = []
  for (const file of SOURCES) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(new RegExp(pattern))) {
      const key = match[1]
      if (key !== undefined && key !== '') found.push({ key, file })
    }
  }
  return found
}

describe('the translation keys the code uses', () => {
  it('finds call sites at all, so an empty pass means nothing', () => {
    // Without this the whole file passes vacuously the day the regex stops
    // matching, which is the failure mode of every scanning test ever written.
    expect(collect(STATIC_KEY).length).toBeGreaterThan(40)
  })

  it('all exist in ca.json', () => {
    const missing = collect(STATIC_KEY)
      .filter(({ key }) => !resolves(key))
      .map(({ key, file }) => `${key}  (${file})`)

    expect(
      [...new Set(missing)].sort(),
      'i18next renders a missing key as the key itself, so these appear on ' +
        'screen in capitals rather than failing.',
    ).toEqual([])
  })

  it('and the fixed part of every computed key names something real', () => {
    const missing = collect(DYNAMIC_PREFIX)
      .map(({ key, file }) => ({ key: key.replace(/\.$/, ''), file }))
      .filter(({ key }) => typeof lookup(key) !== 'object' || lookup(key) === null)
      .map(({ key, file }) => `${key}  (${file})`)

    expect([...new Set(missing)].sort()).toEqual([])
  })
})

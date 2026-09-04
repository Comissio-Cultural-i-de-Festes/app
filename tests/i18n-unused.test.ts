import { globSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import ca from '../src/i18n/locales/ca.json' with { type: 'json' }

/**
 * No key sits in the locale files that nothing can ever show.
 *
 * This is the third direction, and the one that was missing. `i18n-usage`
 * checks code → locale: every key the code asks for exists. `i18n-parity`
 * checks locale ↔ locale: the three files agree. Neither checks locale → code,
 * so a key nobody asks for passed CI forever — and seventeen of them had.
 *
 * They are not harmless. Two of them, `errors.unauthorized` and
 * `errors.expired`, read like a working error path and were not one: nothing
 * could return them, so the sentence they promise never appeared. Somebody
 * reading the locale file would reasonably conclude the app tells a member
 * their session has lapsed. It did not.
 *
 * WHY THIS CANNOT BE A NAIVE GREP. A key is reachable three ways, and only the
 * first is a plain literal:
 *
 *   1. `t('a.b.c')` — the quoted path.
 *   2. `t(`a.b.${row.motivo}`)` — only the fixed prefix is visible, so every
 *      key under it is reachable. There are thirty-two such prefixes.
 *   3. As a literal RETURNED by something that is not a `t()` call at all:
 *      `errorKey()` returns `'errors.forbidden'`, `SCAN_PRESENTATION` carries
 *      `messageKey: 'scanner.ok'`, and another place does `t(variable)`.
 *      Searching for the quoted string covers this one too.
 *
 * Plus i18next's plural suffixes: `foo_one` is asked for as `foo`.
 */

const SOURCES = globSync('src/**/*.{ts,tsx}')
const TEXT = SOURCES.map((f) => readFileSync(f, 'utf8'))

/** t(`a.b.${…}`) — every key under the fixed part is reachable. */
const DYNAMIC_PREFIX = /\bt\(\s*`([A-Za-z0-9_.]*)\$\{/g

/** i18next stores a pluralised key as `key_one`, `key_other`, … */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

/**
 * The two that stay, and why.
 *
 * `legal.privacy` and `legal.terms` are as unreachable as the seventeen that
 * were deleted, and they are kept on purpose: there is no screen anywhere in
 * this app where a member can read a privacy policy or terms of use, in an app
 * that holds names, phone numbers and photographs of real people. The keys are
 * the only trace of that, and deleting them would tidy away the evidence of a
 * gap in the product rather than the gap.
 *
 * Removing an entry from this list is the right move the day the screen exists.
 */
const KEPT_ON_PURPOSE = ['legal.privacy', 'legal.terms']

function leafKeys(node: unknown, path = ''): string[] {
  if (typeof node !== 'object' || node === null) return [path]
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leafKeys(v, path === '' ? k : `${path}.${k}`),
  )
}

function prefixes(): string[] {
  const found = new Set<string>()
  for (const text of TEXT) {
    for (const m of text.matchAll(DYNAMIC_PREFIX)) {
      if (m[1] !== undefined && m[1] !== '') found.add(m[1])
    }
  }
  return [...found]
}

function mentionedLiterally(key: string): boolean {
  const quoted = [`'${key}'`, `"${key}"`, `\`${key}\``]
  return TEXT.some((text) => quoted.some((q) => text.includes(q)))
}

describe('the locale files carry nothing unreachable', () => {
  const keys = leafKeys(ca)
  const dynamic = prefixes()

  // Without these two, a scanner that silently found nothing would make the
  // assertion below vacuously true — the same guard `i18n-usage` keeps.
  it('finds keys and dynamic prefixes at all, so an empty pass means nothing', () => {
    expect(keys.length).toBeGreaterThan(1000)
    expect(dynamic.length).toBeGreaterThan(20)
    expect(SOURCES.length).toBeGreaterThan(150)
  })

  it('has no key the code can never ask for', () => {
    const unreachable = keys.filter((key) => {
      const base = key.replace(PLURAL_SUFFIX, '')
      if (mentionedLiterally(key) || mentionedLiterally(base)) return false
      return !dynamic.some((p) => key.startsWith(p) || base.startsWith(p))
    })

    expect(unreachable.filter((k) => !KEPT_ON_PURPOSE.includes(k))).toEqual([])
  })

  // The other half: the allow-list has to stay honest. An entry that has
  // become reachable is an entry that should not be excused any more.
  it('does not excuse a key that is actually used', () => {
    const excusedButAlive = KEPT_ON_PURPOSE.filter(
      (key) => mentionedLiterally(key) || dynamic.some((p) => key.startsWith(p)),
    )

    expect(excusedButAlive).toEqual([])
  })
})
